put({id:"tasks",t:"Задачи и ревью",topics:[
{t:"Как вести ревью вслух",call:"Порядок: 1) краши и гонки, 2) неверное поведение (не та картинка, UI не с main), 3) архитектура (DI, отмена, дедупликация, тестируемость), 4) производительность и память. Каждую проблему: что не так → к чему приводит → как исправить.",
d:["Сначала одной фразой сказать, что делает код, — показывает, что ты его понял.","Не тонуть в стиле (имена, отступы) — интервьюеру важны баги и компромиссы.","Предлагать минимальный фикс, затем «как сделал бы в проде».","Если не уверен — сказать, как проверишь (Thread Sanitizer, Main Thread Checker, тест)."],
ex:[]},
{t:"Ревью ImageFetcher: проблемы",call:"Гонка на словаре `cache` (запись из фонового потока URLSession), два force unwrap, completion не на main → UIKit с фона, неверная картинка в переиспользованной ячейке, нет отмены, дубли запросов на один URL, нет проверки статуса/ошибки, неограниченный кеш без реакции на memory warning, синглтон без DI, разные потоки completion (кеш — синхронно, сеть — асинхронно).",
d:["**Гонка**: `cache[url] = image` из потоков URLSession + чтение с main → краш/повреждение. Фикс: NSCache или serial-очередь/lock/actor.","**Force unwrap**: `data!` при ошибке сети, `UIImage(data:)!` на не-картинке/HTML 404 → краш. Фикс: guard, статус-код, `Result`.","**Поток**: completion из фоновой очереди → `avatarView.image = ` не на main (Main Thread Checker). Фикс: переход на main у вызывающего или явно в API.","**Reuse**: ячейку переиспользовали, а старый запрос вернулся → чужой аватар. Фикс: сохранять URL/токен, сравнивать; `prepareForReuse` — отмена и сброс.","**Отмена и дедуп**: прокрутка генерирует сотни запросов; один URL качается N раз. Фикс: токен отмены, in-flight словарь колбэков.","**Память**: словарь растёт бесконечно, декодированные картинки полного размера. Фикс: NSCache с cost, downsampling.","**Синглтон**: прямой `ImageFetcher.shared` в ячейке → нельзя подменить в тестах. Фикс: протокол + инъекция.","**Мелочи**: `self` в замыкании держит ячейку до конца запроса; кеш отвечает синхронно, сеть — асинхронно (непредсказуемый порядок)."],
ex:[{n:"Исходный код",c:R`
final class ImageFetcher {
    static let shared = ImageFetcher()
    var cache: [URL: UIImage] = [:]

    func fetch(_ url: URL, completion: @escaping (UIImage?) -> Void) {
        if let image = cache[url] { completion(image); return }
        URLSession.shared.dataTask(with: url) { data, response, error in
            let image = UIImage(data: data!)!
            self.cache[url] = image
            completion(image)
        }.resume()
    }
}
final class AvatarCell: UITableViewCell {
    let avatarView = UIImageView()
    func configure(with user: User) {
        ImageFetcher.shared.fetch(user.avatarURL) { image in
            self.avatarView.image = image
        }
    }
}`}]},
{t:"ImageFetcher: исправленная версия (колбэки)",call:"NSCache для памяти, serial-очередь для состояния in-flight, токен для отмены, один сетевой запрос на URL, проверка статуса, completion всегда на main. Ячейка хранит токен и текущий URL, отменяет в `prepareForReuse`.",
d:["Отмена одного подписчика не отменяет загрузку, если на неё ещё кто-то подписан.","Попадание в кеш — тоже асинхронно на main (или явно документировать синхронный ответ).","Swift 6: колбэк `@MainActor @Sendable` — компилятор проверит, что UI трогаем на main, а захваты безопасны.","На async/await то же самое проще: actor + in-flight `Task` (см. Swift Concurrency → Actor и реентрантность)."],
ex:[{n:"Загрузчик",c:R`
protocol ImageLoading {
    @discardableResult
    func load(_ url: URL, completion: @escaping @MainActor @Sendable (UIImage?) -> Void) -> UUID?
    func cancel(_ token: UUID)
}

final class ImageLoader: ImageLoading, @unchecked Sendable {
    private let cache = NSCache<NSURL, UIImage>()
    private let session: URLSession
    private let queue = DispatchQueue(label: "image.loader")       // защищает поля ниже
    private var waiters: [URL: [UUID: @MainActor @Sendable (UIImage?) -> Void]] = [:]
    private var tasks: [URL: URLSessionDataTask] = [:]

    init(session: URLSession = .shared) { self.session = session; cache.countLimit = 300 }

    @discardableResult
    func load(_ url: URL, completion: @escaping @MainActor @Sendable (UIImage?) -> Void) -> UUID? {
        if let img = cache.object(forKey: url as NSURL) {
            DispatchQueue.main.async { completion(img) }
            return nil
        }
        let token = UUID()
        queue.async {
            self.waiters[url, default: [:]][token] = completion
            guard self.tasks[url] == nil else { return }               // уже грузится — ждём
            let task = self.session.dataTask(with: url) { data, resp, _ in
                let ok = (resp as? HTTPURLResponse)?.statusCode == 200
                let image = ok ? data.flatMap(UIImage.init(data:)) : nil
                if let image { self.cache.setObject(image, forKey: url as NSURL) }
                self.queue.async {
                    let callbacks = self.waiters.removeValue(forKey: url) ?? [:]
                    self.tasks[url] = nil
                    DispatchQueue.main.async { callbacks.values.forEach { $0(image) } }
                }
            }
            self.tasks[url] = task
            task.resume()
        }
        return token
    }

    func cancel(_ token: UUID) {
        queue.async {
            for (url, var w) in self.waiters where w[token] != nil {
                w[token] = nil
                if w.isEmpty {                       // больше никто не ждёт
                    self.waiters[url] = nil
                    self.tasks.removeValue(forKey: url)?.cancel()
                } else {
                    self.waiters[url] = w
                }
            }
        }
    }
}`},
{n:"Ячейка",c:R`
final class AvatarCell: UITableViewCell {
    let avatarView = UIImageView()
    private var token: UUID?
    private var currentURL: URL?
    var loader: ImageLoading!                       // инъекция

    func configure(with user: User) {
        currentURL = user.avatarURL
        token = loader.load(user.avatarURL) { [weak self] image in
            guard let self, self.currentURL == user.avatarURL else { return }
            self.avatarView.image = image ?? UIImage(systemName: "person.circle")
        }
    }
    override func prepareForReuse() {
        super.prepareForReuse()
        if let token { loader.cancel(token) }
        token = nil; currentURL = nil
        avatarView.image = nil
    }
}`}]},
{t:"Многопоточный обход дерева (DFS + DispatchGroup)",call:"Каждый узел обрабатывается в отдельной задаче: `group.enter()` до `async`, `leave()` в `defer`; общий результат — под lock/Mutex; ждать через `notify`, а не `wait` на main. Порядок результата недетерминирован. UIView можно читать только на main — для UIKit-дерева параллелизм не подходит.",
d:["`enter()` внутри async — `notify` может сработать, пока дети ещё не добавлены.","`leave()` вне критической секции; `unlock` — через `defer`.","Swift 6: захват изменяемого `var` в `@Sendable` — ошибка → `Mutex` (iOS 18) или `@unchecked Sendable` класс с NSLock.","Для маленького дерева параллелизм медленнее последовательного обхода (накладные расходы на задачи); для CPU-работы — `concurrentPerform` или TaskGroup.","Узлы дерева должны быть Sendable (иммутабельные `let`)."],
ex:[{n:"GCD-версия",c:R`
final class Node: Sendable {
    let value: Int
    let children: [Node]
    init(_ v: Int, _ c: [Node] = []) { value = v; children = c }
}

final class Collector: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [Int] = []
    func add(_ v: Int) { lock.lock(); defer { lock.unlock() }; values.append(v) }
    var result: [Int] { lock.lock(); defer { lock.unlock() }; return values }
}

func parallelDFS(_ root: Node, completion: @escaping @Sendable ([Int]) -> Void) {
    let group = DispatchGroup()
    let out = Collector()
    @Sendable func visit(_ n: Node) {
        group.enter()                                  // до async
        DispatchQueue.global().async {
            defer { group.leave() }
            out.add(n.value)
            n.children.forEach(visit)                  // дети тоже enter до своего async
        }
    }
    visit(root)
    group.notify(queue: .main) { completion(out.result) }
}

let tree = Node(1, [Node(2, [Node(4)]), Node(3)])
parallelDFS(tree) { print($0.sorted()) }   // [1, 2, 3, 4]  (без sorted — порядок любой)`},
{n:"TaskGroup-версия",c:R`
func sum(_ n: Node) async -> Int {
    await withTaskGroup(of: Int.self) { group in
        for child in n.children { group.addTask { await sum(child) } }
        var total = n.value
        for await s in group { total += s }
        return total
    }
}
// await sum(tree)  → 10`}]},
{t:"Вопросы компании в конце",call:"Спросить про команду и продукт: чем занимается команда и какие задачи будут в первые 3 месяца; как устроены код-ревью, релизы и тестирование; доля UIKit/SwiftUI/Obj-C; как измеряют качество (crash-free, hitches); что для них успех кандидата через полгода.",
d:["2–3 вопроса достаточно; выбрать те, ответ на которые реально важен для решения.","Хороший сигнал — вопросы о процессах и метриках, а не о плюшках.","Можно спросить фидбек: «что по моим ответам стоит подтянуть?»"],
ex:[]}
]});
