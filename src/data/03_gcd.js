put({id:"gcd",t:"GCD и Operation",topics:[
{t:"Очередь ≠ поток",call:"Очередь — это список задач и правило их выполнения (serial/concurrent). Потоки берутся из пула GCD. Serial-очередь выполняет по одной задаче, но не обязательно на одном и том же потоке. Только main queue привязана к main thread.",
d:["Serial: следующая задача стартует после окончания предыдущей → очередь сама по себе синхронизирует доступ.","Concurrent: несколько задач одновременно, порядок старта FIFO, порядок завершения — любой.","Global queues — concurrent с QoS: `.userInteractive`, `.userInitiated`, `.default`, `.utility`, `.background`.","`sync` по возможности выполняет задачу на вызывающем потоке (оптимизация) — поэтому `Thread.current` внутри sync может быть main.","Target queue: свои очереди в итоге выполняются через global-очереди пула."],
ex:[{n:"",c:R`
let serial = DispatchQueue(label: "serial")
let concurrent = DispatchQueue(label: "conc", attributes: .concurrent)

for i in 1...3 { serial.async { print("s", i) } }      // s 1, s 2, s 3 — строго по порядку
for i in 1...3 { concurrent.async { print("c", i) } }  // порядок любой`}]},
{t:"sync, async и deadlock",call:"`sync` блокирует текущий поток до выполнения блока; `async` — ставит в очередь и сразу возвращается. Deadlock: `sync` на serial-очередь изнутри неё самой (в т.ч. `main.sync` с main) — блок ждёт текущую задачу, а она ждёт блок.",
d:["Вложенный `sync` в ту же concurrent-очередь — не deadlock (если нет barrier и не исчерпан пул).","`DispatchQueue.main.sync` из фонового потока — ок, но опасно, если main в этот момент ждёт этот фоновый поток.","Перекрёстный deadlock: A.sync{ B.sync{} } и параллельно B.sync{ A.sync{} }.","`dispatchPrecondition(condition: .onQueue(q))` — проверка в debug, на какой очереди мы находимся."],
ex:[{n:"Порядок печати",c:R`
let q = DispatchQueue(label: "q")
print("A")
q.async { print("B") }
print("C")
// A C B  (почти всегда; B может быть и раньше C — гарантии нет)

print("A")
q.sync { print("B") }
print("C")
// A B C  — гарантированно`},
{n:"Deadlock и не-deadlock",c:R`
let serial = DispatchQueue(label: "s")
serial.async {
    serial.sync { print("never") }   // 💥 deadlock (в debug — краш с EXC_BAD_INSTRUCTION)
}

let conc = DispatchQueue(label: "c", attributes: .concurrent)
conc.async {
    conc.sync { print("ok") }        // ✅ ok
}

// В Playground на main:
// DispatchQueue.main.sync { }      // 💥 deadlock`}]},
{t:"Barrier: потокобезопасный словарь",call:"Читатели–писатели: concurrent-очередь, чтение через `sync`, запись через `async(flags: .barrier)`. Barrier-блок ждёт завершения всех начатых чтений и выполняется один, новые чтения ждут его.",
d:["Barrier работает только на своей concurrent-очереди; на global-очереди он ведёт себя как обычный async.","Чтение `sync`, потому что нужен результат; запись `async`, чтобы не блокировать вызывающего.","Подвох read-modify-write: `d[k] = (d[k] ?? 0) + 1` из двух вызовов — гонка логики даже с потокобезопасными get/set → нужен атомарный метод `modify`.","Альтернативы: NSLock / `OSAllocatedUnfairLock` (iOS 16) / `Mutex` (iOS 18) / actor."],
ex:[{n:"SafeDict",c:R`
final class SafeDict<K: Hashable & Sendable, V: Sendable>: @unchecked Sendable {
    private var storage: [K: V] = [:]
    private let q = DispatchQueue(label: "safe.dict", attributes: .concurrent)

    subscript(key: K) -> V? {
        get { q.sync { storage[key] } }
        set { q.async(flags: .barrier) { self.storage[key] = newValue } }
    }
    func modify(_ key: K, _ body: @escaping @Sendable (inout V?) -> Void) {
        q.async(flags: .barrier) { body(&self.storage[key]) }
    }
}

let d = SafeDict<String, Int>()
DispatchQueue.concurrentPerform(iterations: 1000) { _ in
    d.modify("n") { $0 = ($0 ?? 0) + 1 }
}
print(d["n"]!)   // 1000  (с d["n"] = (d["n"] ?? 0) + 1 было бы < 1000)`}]},
{t:"DispatchSemaphore: 0, 1, N",call:"Счётчик: `wait()` уменьшает и блокирует при < 0, `signal()` увеличивает и будит. Значение 0 — ждать события, 1 — мьютекс, N — ограничение параллелизма до N.",
d:["Semaphore(0) превращает async в sync — антипаттерн на main (фриз, watchdog) и может дать deadlock, если callback приходит на ту же очередь.","Semaphore не знает о приоритетах → priority inversion (lock / Mutex знают владельца).","`wait(timeout:)` возвращает `.success`/`.timedOut`.","Semaphore блокирует поток: внутри Swift Concurrency (async-функций) использовать нельзя."],
ex:[{n:"0 — ждать результат (только не на main)",c:R`
final class Box: @unchecked Sendable { var value = 0 }   // Swift 6: var-захват в @Sendable нельзя
let box = Box()
let sem = DispatchSemaphore(value: 0)
DispatchQueue.global().async {
    box.value = 42
    sem.signal()
}
sem.wait()
print(box.value)   // 42`},
{n:"N — не больше 2 загрузок одновременно",c:R`
let limit = DispatchSemaphore(value: 2)
let q = DispatchQueue.global()
for i in 1...5 {
    q.async {
        limit.wait()
        defer { limit.signal() }
        print("start", i)
        Thread.sleep(forTimeInterval: 1)
        print("end", i)
    }
}
// одновременно в работе максимум 2 задачи`}]},
{t:"DispatchGroup",call:"Ждать несколько асинхронных задач: `enter()` перед каждой, `leave()` ровно один раз в каждом исходе, `notify(queue:)` — когда счётчик стал 0. `wait()` — блокирующий вариант.",
d:["`enter()` вызывать до старта async-работы, а не внутри неё — иначе `notify` может сработать раньше.","`leave()` больше чем `enter()` → краш; забыли `leave()` → notify не придёт никогда. Помогает `defer { group.leave() }`.","`queue.async(group:)` сам делает enter/leave, но только для синхронного тела блока.","Результаты собирать потокобезопасно (serial-очередь, lock) — колбэки приходят с разных потоков."],
ex:[{n:"",c:R`
final class Results: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var items: [Int] = []
    func add(_ x: Int) { lock.lock(); items.append(x); lock.unlock() }
}
let group = DispatchGroup()
let results = Results()

for i in 1...3 {
    group.enter()                         // до async
    DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(100 * i)) {
        defer { group.leave() }
        results.add(i)
    }
}
group.notify(queue: .main) {
    print(results.items.sorted())   // [1, 2, 3]
}`}]},
{t:"Operation и OperationQueue",call:"Обёртка над GCD с зависимостями (`addDependency`), отменой (`cancel()` + проверка `isCancelled`), `maxConcurrentOperationCount` и KVO-состояниями. Нужна, когда задачи связаны графом или их надо отменять/ограничивать.",
d:["`cancel()` только ставит флаг: операция сама должна проверять `isCancelled`; отменённая операция считается завершённой → зависимые от неё всё равно стартуют.","Асинхронная операция: переопределить `isAsynchronous`, `isExecuting`, `isFinished` с KVO-уведомлениями, иначе очередь сочтёт её завершённой сразу.","`maxConcurrentOperationCount = 1` делает очередь serial по выполнению, но порядок задают зависимости и приоритет.","Цикл зависимостей → операции не выполнятся никогда."],
ex:[{n:"Зависимости и отмена",c:R`
let queue = OperationQueue()
queue.maxConcurrentOperationCount = 2

let download = BlockOperation { print("download") }
let parse = BlockOperation { print("parse") }
let save = BlockOperation { print("save") }
parse.addDependency(download)
save.addDependency(parse)
queue.addOperations([save, parse, download], waitUntilFinished: false)
// download → parse → save

final class Work: Operation {
    override func main() {
        for i in 0..<1_000 {
            if isCancelled { return }   // проверяем сами
            _ = i
        }
    }
}`}]},
{t:"Thread explosion и QoS",call:"Если задачи блокируются (sync, semaphore, sleep) на concurrent-очередях, GCD создаёт новые потоки — до ~64 на пул, после чего всё встаёт. Лечится serial-очередями, ограничением параллелизма и отказом от блокировок.",
d:["Каждый поток — память под стек (512 КБ у вторичных) и переключения контекста.","Swift Concurrency решает это кооперативным пулом: потоков ≈ числу ядер, а `await` не блокирует поток.","Priority inversion: высокий QoS ждёт низкий через семафор → система не может поднять приоритет; у serial-очереди и `os_unfair_lock` она это умеет.","`DispatchQueue.concurrentPerform` — правильный способ распараллелить цикл по ядрам."],
ex:[{n:"",c:R`
// ❌ 1000 блокирующих задач → сотни потоков
for _ in 0..<1000 {
    DispatchQueue.global().async { Thread.sleep(forTimeInterval: 1) }
}

// ✅ параллелизм по числу ядер
DispatchQueue.concurrentPerform(iterations: 1000) { i in
    _ = i * i
}`}]},
{t:"Thread и RunLoop",call:"`Thread` — ручной поток: свой `stackSize`, имя, приоритет. Без RunLoop поток завершается после блока; чтобы он жил и принимал таймеры/порты, нужен `RunLoop.current.run()` с источником.",
d:["У main-потока RunLoop запущен системой, у созданных потоков — нет (создаётся лениво при обращении `RunLoop.current`).","RunLoop без источников (`Port`, `Timer`) сразу выходит из `run()`.","Режимы: `.default` и `.tracking` (при скролле), `.common` включает оба → таймер в `.default` замирает при скролле.","На практике ручные Thread почти не нужны — GCD/Concurrency."],
ex:[{n:"",c:R`
let t = Thread {
    let timer = Timer(timeInterval: 1, repeats: true) { _ in print("tick", Thread.current.name ?? "") }
    RunLoop.current.add(timer, forMode: .default)
    RunLoop.current.run()      // держит поток живым
}
t.name = "worker"
t.stackSize = 1 << 20          // 1 МБ, задаётся до start()
t.start()

// Таймер, который не замирает при скролле:
// RunLoop.main.add(timer, forMode: .common)`}]}
]});
