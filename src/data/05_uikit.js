put({id:"uikit",t:"UIKit",topics:[
{t:"Жизненный цикл UIViewController",call:"`loadView` → `viewDidLoad` (один раз) → `viewWillAppear` → `viewIsAppearing` (iOS 13+, размеры и trait уже известны) → `viewWillLayoutSubviews`/`viewDidLayoutSubviews` (много раз) → `viewDidAppear`. Уход: `viewWillDisappear` → `viewDidDisappear`. `deinit` — когда VC больше никто не держит.",
d:["`loadView` переопределяют, только чтобы задать свой корневой view (`view = MyView()`), без `super`.","`view` загружается лениво: обращение к `vc.view` до показа вызовет `loadView` + `viewDidLoad` сразу.","`viewWillAppear`/`viewDidAppear` вызываются при каждом показе (возврат по back, закрытие модалки `.fullScreen`).","Модалка `.pageSheet`/`.formSheet` (по умолчанию с iOS 13): нижний VC остаётся на экране → его `viewWillDisappear`/`viewWillAppear` НЕ вызываются.","Layout-методы — для расчётов, зависящих от размеров; там не создавать view и не добавлять констрейнты (вызываются многократно)."],
ex:[{n:"Push A → B и назад",c:R`
// push B:
// B.viewDidLoad
// A.viewWillDisappear
// B.viewWillAppear
// B.viewIsAppearing
// A.viewDidDisappear
// B.viewDidAppear
//
// pop B:
// B.viewWillDisappear
// A.viewWillAppear
// A.viewIsAppearing
// B.viewDidDisappear
// A.viewDidAppear
// B.deinit   (если нет утечки)`}]},
{t:"viewDidLoad vs viewWillAppear: что куда",call:"`viewDidLoad` — однократная настройка: иерархия, констрейнты, подписки, первый запрос. `viewWillAppear`/`viewIsAppearing` — то, что обновляется при каждом показе (данные, навбар, выделение ячейки). Геометрия — не в `viewDidLoad`.",
d:["Ошибка: читать `view.bounds` в `viewDidLoad` — размер ещё из xib/дефолта, не финальный.","Ошибка: подписываться на Notification в `viewWillAppear` без отписки → множественные подписки.","Ошибка: стартовать запрос в `viewWillAppear` без защиты → повтор при каждом возврате.","Таймеры/анимации запускать в `viewDidAppear`, останавливать в `viewDidDisappear`."],
ex:[{n:"",c:R`
final class FeedVC: UIViewController {
    private let table = UITableView()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(table)
        table.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            table.topAnchor.constraint(equalTo: view.topAnchor),
            table.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            table.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            table.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        load()
    }
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if let ip = table.indexPathForSelectedRow { table.deselectRow(at: ip, animated: true) }
    }
    private func load() {}
}`}]},
{t:"Навигация и контейнеры",call:"`UINavigationController` хранит стек `viewControllers` и держит их сильно; push/pop меняют стек. Свой контейнер: `addChild` → `addSubview` → `didMove(toParent:)`, удаление — в обратном порядке.",
d:["`setViewControllers(_:animated:)` — заменить весь стек (например, после логина).","Модальный показ: presenting VC держит presented; `dismiss` вызывается на любом из них.","Без `addChild` дочерний VC не получает appearance-колбэки и trait changes.","Координатор — выносит переходы из VC; VC сообщает о событии через замыкание/делегат."],
ex:[{n:"Child VC",c:R`
func embed(_ child: UIViewController, in container: UIView) {
    addChild(child)
    child.view.frame = container.bounds
    child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.addSubview(child.view)
    child.didMove(toParent: self)
}
func remove(_ child: UIViewController) {
    child.willMove(toParent: nil)
    child.view.removeFromSuperview()
    child.removeFromParent()
}`}]},
{t:"Hit-testing и responder chain",call:"Касание ищется сверху вниз: `hitTest(_:with:)` от окна рекурсивно, в обратном порядке subviews (верхний первым). View пропускается, если скрыт, `alpha < 0.01`, `isUserInteractionEnabled == false` или точка вне `point(inside:)`. Событие, не обработанное view, идёт вверх по responder chain: view → superview → VC → … → window → application.",
d:["Subview за пределами bounds родителя не получает касания (даже если видна при `clipsToBounds = false`) — родитель отсекает по `point(inside:)`.","Увеличить зону нажатия: переопределить `point(inside:)` с `bounds.insetBy(dx: -20, dy: -20)`.","Пропускающий view (оверлей): вернуть nil, если hitTest попал в сам view.","Жесты распознаются параллельно: gesture recognizer получает touches раньше view и может отменить их (`cancelsTouchesInView`)."],
ex:[{n:"Как устроен hitTest",c:R`
extension UIView {
    func myHitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha >= 0.01,
              self.point(inside: point, with: event) else { return nil }
        for sub in subviews.reversed() {
            let p = sub.convert(point, from: self)
            if let hit = sub.myHitTest(p, with: event) { return hit }
        }
        return self
    }
}`},
{n:"Зона нажатия +20pt и сквозной оверлей",c:R`
final class BigTapButton: UIButton {
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: -20, dy: -20).contains(point)
    }
}

final class PassThroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit   // касания по пустому месту уходят ниже
    }
}`}]},
{t:"Клавиатура: скрыть и подвинуть",call:"Скрыть: `view.endEditing(true)` или `UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)` — `to: nil` отправляет first responder'у. Для скролла: `keyboardDismissMode = .interactive`. Подвинуть контент: `view.keyboardLayoutGuide` (iOS 15+).",
d:["`sendAction` с `to: nil` идёт по responder chain от first responder, возвращает `Bool` — нашёлся ли обработчик.","`endEditing(true)` ищет first responder только внутри этого view.","Старый способ: `keyboardWillShowNotification` + `keyboardFrameEndUserInfoKey` → `contentInset.bottom`.","Тап по фону: `UITapGestureRecognizer` с `cancelsTouchesInView = false`, иначе сломает тапы по ячейкам."],
ex:[{n:"",c:R`
// 1. Глобально
UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                to: nil, from: nil, for: nil)

// 2. Тап по фону
let tap = UITapGestureRecognizer(target: view, action: #selector(UIView.endEditing(_:)))
tap.cancelsTouchesInView = false
view.addGestureRecognizer(tap)

// 3. Скролл
tableView.keyboardDismissMode = .interactive

// 4. Поле над клавиатурой
textField.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -8).isActive = true`}]},
{t:"Auto Layout: intrinsicContentSize, hugging, compression",call:"`intrinsicContentSize` — естественный размер view (у UILabel по тексту). Hugging — сопротивление растяжению, compression resistance — сжатию; при конфликте побеждает больший приоритет (дефолты: hugging 250, compression 750).",
d:["Свой view с естественным размером: переопределить `intrinsicContentSize` и звать `invalidateIntrinsicContentSize()` при изменении данных.","Два лейбла в ряд: тот, что должен сжиматься (обрезаться), получает меньший compression resistance.","`UIView.noIntrinsicMetric` — для измерения, которого нет.","Ambiguous layout ищется через `hasAmbiguousLayout`, `exerciseAmbiguityInLayout()`, View Debugger; конфликты — в логе `Unable to simultaneously satisfy constraints`."],
ex:[{n:"TagView",c:R`
final class TagView: UIView {
    var text = "" { didSet { invalidateIntrinsicContentSize(); setNeedsDisplay() } }
    private let font = UIFont.systemFont(ofSize: 14)

    override var intrinsicContentSize: CGSize {
        let s = (text as NSString).size(withAttributes: [.font: font])
        return CGSize(width: ceil(s.width) + 16, height: ceil(s.height) + 8)
    }
}`},
{n:"Кто сожмётся",c:R`
// [name ............][date]
name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)   // 250 → обрежется
date.setContentCompressionResistancePriority(.required, for: .horizontal)     // 1000 → целиком
date.setContentHuggingPriority(.required, for: .horizontal)                   // не растянется`}]},
{t:"Frames vs Auto Layout, цикл layout",call:"`frame` — в координатах superview, `bounds` — свои (origin = смещение контента, у scroll view это contentOffset). Auto Layout считает frame из констрейнтов. Цикл: констрейнты (`updateConstraints`) → layout (`layoutSubviews`) → отрисовка (`draw`).",
d:["`setNeedsLayout` — пометить, layout в следующем цикле RunLoop; `layoutIfNeeded` — выполнить сейчас (так анимируют констрейнты).","`setNeedsDisplay` → `draw(_:)` в следующем цикле; переопределять `draw` дорого (backing store).","При трансформации `frame` не определён — использовать `bounds` и `center`.","Ручные frames в `layoutSubviews` быстрее Auto Layout для сложных ячеек."],
ex:[{n:"Анимация констрейнта",c:R`
heightConstraint.constant = 200
UIView.animate(withDuration: 0.3) {
    self.view.layoutIfNeeded()     // анимируется пересчёт frame
}`},
{n:"bounds у scroll view",c:R`
scrollView.contentOffset = CGPoint(x: 0, y: 100)
print(scrollView.bounds.origin)   // (0.0, 100.0)
print(scrollView.frame.origin)    // не изменился`}]}
]});
