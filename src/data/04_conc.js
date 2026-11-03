put({id:"conc",t:"Swift Concurrency",topics:[
{t:"async/await и кооперативный пул",call:"`await` — точка приостановки: функция отдаёт поток, а не блокирует его. Продолжение может выполниться на другом потоке. Пул потоков ограничен числом ядер, поэтому блокировать его (semaphore, sleep, sync-ожидание) нельзя.",
d:["После `await` нельзя полагаться на тот же поток; изоляция гарантирована только актором (`@MainActor` вернёт на main).","Состояние между `await` могло измениться — проверять заново (реентрантность).","`Task { }` наследует актора, приоритет и task-locals; `Task.detached` — ничего не наследует.","Swift 6 (6.2, Xcode 26): nonisolated async-функции по умолчанию могут выполняться на акторе вызывающего (`NonisolatedNonsendingByDefault`), для ухода в пул — `@concurrent`. Это включается флагом / Approachable Concurrency."],
ex:[{n:"Порядок выполнения",c:R`
func work() async -> Int {
    try? await Task.sleep(for: .milliseconds(100))
    return 1
}
Task {
    print("1")
    let x = await work()   // поток свободен 100 мс
    print("2", x)
}
print("0")
// 0 1 2 1  (Task стартует асинхронно; "0" почти всегда первым)`}]},
{t:"Structured concurrency: async let и TaskGroup",call:"`async let` — фиксированное число параллельных дочерних задач; `withTaskGroup` — динамическое. Дочерние задачи не переживают родителя: отмена родителя отменяет детей, ошибка в группе отменяет остальных при выходе.",
d:["`async let` без `await` в конце скоупа — задача неявно отменяется и ожидается.","`withThrowingTaskGroup`: первая ошибка из `next()`/`for try await` пробрасывается, остальные задачи отменяются.","Результаты группы приходят в порядке завершения, а не добавления — порядок восстанавливать по индексу.","Ограничение параллелизма в группе: стартовать N задач, затем добавлять по одной после каждого `next()`."],
ex:[{n:"async let",c:R`
func loadUser() async -> String { "Roman" }
func loadFeed() async -> [Int] { [1, 2, 3] }

func screen() async {
    async let user = loadUser()
    async let feed = loadFeed()     // обе идут параллельно
    let (u, f) = await (user, feed)
    print(u, f.count)               // Roman 3
}`},
{n:"TaskGroup с сохранением порядка и лимитом 3",c:R`
func fetch(_ i: Int) async -> String { "item\(i)" }

func fetchAll(_ ids: [Int]) async -> [String] {
    await withTaskGroup(of: (Int, String).self) { group in
        var result = [String](repeating: "", count: ids.count)
        var next = 0
        for _ in 0..<min(3, ids.count) {
            let i = next; group.addTask { (i, await fetch(ids[i])) }; next += 1
        }
        while let (i, value) = await group.next() {
            result[i] = value
            if next < ids.count {
                let j = next; group.addTask { (j, await fetch(ids[j])) }; next += 1
            }
        }
        return result
    }
}
// await fetchAll([5, 6, 7, 8]) → ["item5", "item6", "item7", "item8"]`}]},
{t:"Отмена задач",call:"Отмена кооперативная: `task.cancel()` ставит флаг, код сам проверяет `Task.isCancelled` или вызывает `try Task.checkCancellation()` (бросает `CancellationError`). `Task.sleep` и URLSession сами реагируют на отмену.",
d:["Отмена распространяется вниз по дереву дочерних задач, но не на `Task {}` / `Task.detached` внутри — это неструктурированные задачи.","`withTaskCancellationHandler` — немедленная реакция (отменить URLSessionTask, закрыть сокет).","SwiftUI `.task` отменяет задачу при исчезновении view; `.task(id:)` — при смене id.","Хранить `Task` и отменять в `deinit`/`viewWillDisappear` для UIKit."],
ex:[{n:"",c:R`
let task = Task {
    for i in 1...5 {
        try Task.checkCancellation()
        print("step", i)
        try await Task.sleep(for: .milliseconds(100))   // бросит CancellationError при отмене
    }
}
Task {
    try? await Task.sleep(for: .milliseconds(250))
    task.cancel()
}
// step 1, step 2, step 3 — дальше остановится`}]},
{t:"Task.sleep vs Thread.sleep, Task.yield",call:"`Task.sleep` приостанавливает задачу, поток свободен, реагирует на отмену. `Thread.sleep` блокирует поток пула — нельзя. `Task.yield()` даёт другим задачам выполниться в длинном цикле.",
d:["`Task.sleep(for: .seconds(1))` (iOS 16+) или `nanoseconds:`.","В долгом CPU-цикле внутри async — периодически `await Task.yield()` и проверять отмену.","Тяжёлую синхронную работу лучше вынести из кооперативного пула (своя очередь + continuation), чтобы не занимать его поток."],
ex:[{n:"",c:R`
func heavy() async throws -> Int {
    var sum = 0
    for i in 0..<1_000_000 {
        sum &+= i
        if i % 10_000 == 0 {
            try Task.checkCancellation()
            await Task.yield()
        }
    }
    return sum
}`}]},
{t:"Actor и реентрантность",call:"Actor сериализует доступ к своему состоянию: одновременно выполняется один фрагмент кода. Но на каждом `await` внутри метода актор освобождается и может выполнять другие вызовы — состояние после `await` надо перепроверять.",
d:["Вызов метода актора снаружи — всегда `await` (возможное ожидание очереди).","Классическая ошибка: проверили кеш → `await` загрузка → записали. Два одновременных вызова оба промахнутся и загрузят дважды.","Фикс: хранить in-flight `Task` в словаре и отдавать его вторым вызывающим.","`nonisolated` — метод не трогает изолированное состояние, вызывается без await.","Данные, пересекающие границу актора, должны быть Sendable (поэтому `Data`, а не `UIImage`)."],
ex:[{n:"❌ Двойная загрузка",c:R`
actor ImageCache {
    private var cache: [URL: Data] = [:]
    func image(_ url: URL) async throws -> Data {
        if let d = cache[url] { return d }
        let (d, _) = try await URLSession.shared.data(from: url)   // тут актор свободен
        cache[url] = d        // второй вызов уже тоже грузит
        return d
    }
}`},
{n:"✅ Дедупликация через in-flight Task",c:R`
actor ImageLoader {
    private enum Entry { case loading(Task<Data, Error>), ready(Data) }
    private var entries: [URL: Entry] = [:]

    func data(for url: URL) async throws -> Data {
        switch entries[url] {
        case .ready(let d)?: return d
        case .loading(let t)?: return try await t.value
        case nil: break
        }
        let task = Task { try await URLSession.shared.data(from: url).0 }
        entries[url] = .loading(task)          // до первого await!
        do {
            let d = try await task.value
            entries[url] = .ready(d)
            return d
        } catch {
            entries[url] = nil                 // чтобы можно было повторить
            throw error
        }
    }
}`}]},
{t:"@MainActor и Sendable",call:"`@MainActor` — глобальный актор main-потока: UI-код, view model. `Sendable` — тип можно безопасно передать между доменами изоляции. В Swift 6 нарушения — ошибки компиляции.",
d:["Sendable автоматически: value-типы из Sendable-полей, акторы, `final class` только с `let` Sendable-полями.","`@unchecked Sendable` — обещание компилятору, что синхронизация сделана вручную (lock/очередь).","`@Sendable` замыкание не может захватывать изменяемые `var`.","`MainActor.assumeIsolated { }` — для колбэков, про которые известно, что они на main, но компилятор не знает.","`await MainActor.run { }` — перейти на main из async-кода."],
ex:[{n:"",c:R`
@MainActor
final class FeedViewModel {
    private(set) var items: [String] = []
    func load() async {
        let data = await Service().fetch()   // уходит с main
        items = data                          // снова на main
    }
}
final class Service: Sendable {
    func fetch() async -> [String] { ["a", "b"] }
}`}]},
{t:"Continuations: мост от колбэков",call:"`withCheckedThrowingContinuation` превращает completion-handler в async. `resume` нужно вызвать ровно один раз: два раза — краш, ни разу — задача зависнет навсегда (checked выдаст предупреждение в лог).",
d:["`withChecked…` проверяет двойной/пропущенный resume в рантайме; `withUnsafe…` — без проверок, чуть быстрее.","`resume(with: Result)` — удобно для Result-колбэков.","Делегатные API: сохранить continuation в свойство и резюмить в методе делегата; следить, чтобы второй запрос не перезаписал первый.","Для потоков событий — `AsyncStream` и его `continuation.yield`/`finish`."],
ex:[{n:"",c:R`
func legacyLoad(_ id: Int, completion: @escaping @Sendable (Result<String, Error>) -> Void) {
    DispatchQueue.global().async { completion(.success("user \(id)")) }
}

func load(_ id: Int) async throws -> String {
    try await withCheckedThrowingContinuation { cont in
        legacyLoad(id) { result in
            cont.resume(with: result)   // ровно один раз
        }
    }
}
// let u = try await load(7)  → "user 7"`},
{n:"AsyncStream",c:R`
func ticks(_ n: Int) -> AsyncStream<Int> {
    AsyncStream { cont in
        for i in 1...n { cont.yield(i) }
        cont.finish()
    }
}
// for await t in ticks(3) { print(t) }   // 1 2 3`}]},
{t:"Блокировки: Mutex, OSAllocatedUnfairLock, NSLock",call:"Для короткой синхронной критической секции быстрее lock, чем actor. `Mutex` (iOS 18, `import Synchronization`) и `OSAllocatedUnfairLock` (iOS 16, `import os`) — замыкание `withLock`, сами Sendable. `NSLock` — классика, но не держать lock через `await`.",
d:["Actor — когда нужна асинхронность и изоляция состояния; lock — когда нужен синхронный доступ без await.","`os_unfair_lock` в Swift напрямую как `var` использовать нельзя (адрес не стабилен) — отсюда OSAllocatedUnfairLock.","Рекурсивный захват — deadlock (кроме `NSRecursiveLock`).","Атомики: `Atomic<Int>` из Synchronization (iOS 18)."],
ex:[{n:"Mutex + concurrentPerform",c:R`
import Synchronization

let sum = Mutex(0)
DispatchQueue.concurrentPerform(iterations: 100) { i in
    sum.withLock { $0 += i }
}
print(sum.withLock { $0 })   // 4950`},
{n:"OSAllocatedUnfairLock (iOS 16+)",c:R`
import os

final class Counter: Sendable {
    private let state = OSAllocatedUnfairLock(initialState: 0)
    func increment() { state.withLock { $0 += 1 } }
    var value: Int { state.withLock { $0 } }
}`}]}
]});
