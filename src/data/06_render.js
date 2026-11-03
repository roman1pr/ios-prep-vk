put({id:"render",t:"Рендеринг и производительность",topics:[
{t:"Как кадр попадает на экран",call:"Main thread: layout → display (draw) → prepare (декодирование картинок) → commit дерева слоёв в render server. Render server и GPU рисуют кадр. На 60 Гц бюджет 16,7 мс, на 120 Гц (ProMotion) — 8,3 мс. Hitch = кадр не успел.",
d:["Commit происходит в конце итерации RunLoop (`CATransaction`), поэтому изменения в одном цикле объединяются.","Commit hitch — долгий main thread (layout, тяжёлый draw, декодирование). Render hitch — тяжёлая работа render server (offscreen, blending, огромные слои).","Декодирование JPEG/PNG происходит лениво при первом показе на main — отсюда фризы в списках.","Инструменты: Instruments → Animation Hitches, Time Profiler; Xcode → Debug → View Debugging."],
ex:[{n:"",c:R`
// Изменения в одном цикле RunLoop → один commit
view.backgroundColor = .red
view.frame.origin.x += 10
view.alpha = 0.5
// render server получит одно обновление`}]},
{t:"CALayer: неявные анимации и model/presentation",call:"Изменение анимируемого свойства отдельного CALayer анимируется неявно (0,25 с). У слоя, принадлежащего UIView, неявные анимации отключены (view возвращает NSNull в `action(for:forKey:)`) — кроме блока `UIView.animate`. Анимация меняет только presentation layer, model value нужно выставлять самому.",
d:["Model layer — что вы задали; presentation layer (`layer.presentation()`) — что сейчас на экране.","Ловушка: `CABasicAnimation` без изменения model value — по окончании слой «прыгает» назад.","`fillMode = .forwards` + `isRemovedOnCompletion = false` — костыль: model остаётся старым, hit-testing и следующий расчёт врут.","Правильно: выставить новое значение модели без неявной анимации, затем добавить явную анимацию с fromValue."],
ex:[{n:"Неявная анимация",c:R`
let layer = CALayer()
view.layer.addSublayer(layer)
layer.opacity = 0.2           // отдельный слой — анимируется 0.25 с

CATransaction.begin()
CATransaction.setDisableActions(true)
layer.opacity = 1             // без анимации
CATransaction.commit()

view.layer.opacity = 0.2      // backing layer UIView — без анимации`},
{n:"Правильная явная анимация",c:R`
let anim = CABasicAnimation(keyPath: "position.y")
anim.fromValue = layer.position.y
anim.toValue = 300
anim.duration = 0.4

CATransaction.begin()
CATransaction.setDisableActions(true)
layer.position.y = 300        // 1. меняем модель
CATransaction.commit()
layer.add(anim, forKey: "move")   // 2. анимируем визуально
// после окончания слой остаётся на 300 и не прыгает`}]},
{t:"Offscreen rendering и blending",call:"Offscreen — render server рисует слой в отдельный буфер, а потом композитит: тень без `shadowPath`, маски, `cornerRadius` + `masksToBounds` с содержимым subviews, `shouldRasterize`, групповая прозрачность. Blending — смешивание полупрозрачных слоёв, дорого на больших площадях.",
d:["Тень: задать `shadowPath` — иначе система вычисляет форму по альфа-каналу содержимого.","`cornerRadius` + `masksToBounds` на простом слое без сабвью/контента часто не вызывает offscreen; `layer.cornerCurve = .continuous` для «iOS-углов».","`shouldRasterize` полезен только для статичного сложного слоя; при изменении — повторная растеризация каждый кадр. Нужно `rasterizationScale = UIScreen.main.scale` (или трейт `displayScale`).","Проверка в Simulator: Debug → Color Off-screen Rendered (жёлтым), Color Blended Layers (красным)."],
ex:[{n:"Тень без offscreen",c:R`
card.layer.shadowColor = UIColor.black.cgColor
card.layer.shadowOpacity = 0.2
card.layer.shadowRadius = 8
card.layer.shadowOffset = CGSize(width: 0, height: 2)

override func layoutSubviews() {
    super.layoutSubviews()
    card.layer.shadowPath = UIBezierPath(roundedRect: card.bounds, cornerRadius: 12).cgPath
}`},
{n:"Меньше blending",c:R`
label.backgroundColor = .systemBackground   // непрозрачный фон вместо .clear
label.isOpaque = true
imageView.image = opaqueJPEG                // без альфа-канала`}]},
{t:"Плавные списки: reuse, prefetching, downsampling",call:"Ячейки переиспользуются (`dequeueReusableCell`) — сбрасывать состояние в `prepareForReuse` и отменять загрузку. Prefetching (`UITableViewDataSourcePrefetching`) стартует загрузку заранее. Картинки декодировать и уменьшать до размера ячейки в фоне (ImageIO thumbnail или `preparingThumbnail(of:)`).",
d:["Классический баг: асинхронная картинка приходит в уже переиспользованную ячейку → проверять, что ячейка всё ещё для этого id/URL.","Декодированная картинка 4000×3000 = 48 МБ памяти (×4 байта/пиксель) — независимо от размера файла.","`UIImage.preparingForDisplay()` / `byPreparingThumbnail(ofSize:)` (iOS 15) — декодирование вне main.","Высоты ячеек: self-sizing с корректными констрейнтами или кеш высот; `estimatedRowHeight` близкий к реальному.","Diffable data source — анимации без ручного `performBatchUpdates` и без крашей рассинхрона."],
ex:[{n:"Reuse-безопасная загрузка",c:R`
final class PhotoCell: UITableViewCell {
    private var task: Task<Void, Never>?
    private var url: URL?

    func configure(url: URL, loader: ImageLoader) {
        self.url = url
        task = Task { [weak self] in
            guard let data = try? await loader.data(for: url),
                  let img = await UIImage(data: data)?.byPreparingThumbnail(ofSize: CGSize(width: 160, height: 160))
            else { return }
            guard let self, self.url == url else { return }   // ячейку уже переиспользовали?
            self.imageView?.image = img
        }
    }
    override func prepareForReuse() {
        super.prepareForReuse()
        task?.cancel(); task = nil
        imageView?.image = nil
    }
}`},
{n:"Downsampling через ImageIO",c:R`
import ImageIO

func downsample(_ data: Data, maxPixel: CGFloat) -> CGImage? {
    let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary)!
    let opts = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceShouldCacheImmediately: true,      // декодировать сейчас (в фоне)
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixel,   // pt × scale
    ] as CFDictionary
    return CGImageSourceCreateThumbnailAtIndex(src, 0, opts)
}`},
{n:"Prefetching",c:R`
extension FeedVC: UITableViewDataSourcePrefetching {
    func tableView(_ tv: UITableView, prefetchRowsAt indexPaths: [IndexPath]) {
        indexPaths.forEach { loader.prefetch(items[$0.row].url) }
    }
    func tableView(_ tv: UITableView, cancelPrefetchingForRowsAt indexPaths: [IndexPath]) {
        indexPaths.forEach { loader.cancel(items[$0.row].url) }
    }
}`}]},
{t:"Instruments и поиск проблем",call:"Time Profiler — где тратится CPU (Invert Call Tree, Hide System Libraries). Animation Hitches — пропущенные кадры. Allocations/Leaks и Memory Graph — память и циклы. Network — запросы. Профилировать на устройстве и Release-сборке.",
d:["Hang — main thread занят > 250 мс; Xcode Organizer показывает hangs с устройств пользователей.","`os_signpost` / `OSSignposter` — свои интервалы в Instruments.","Memory Graph: фиолетовый «!» — утечка; смотреть, кто держит объект.","MetricKit — метрики (запуск, hangs, крэши) из продакшена."],
ex:[{n:"Signpost",c:R`
import os
let signposter = OSSignposter(subsystem: "app", category: "feed")

func loadFeed() async {
    let state = signposter.beginInterval("loadFeed")
    defer { signposter.endInterval("loadFeed", state) }
    // работа
}`}]}
]});
