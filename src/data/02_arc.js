put({id:"arc",t:"Память и ARC",topics:[
{t:"ARC: strong / weak / unowned",call:"ARC считает сильные ссылки на объекты класса и освобождает объект, когда их 0. `strong` держит; `weak` не держит и обнуляется в nil (всегда Optional var); `unowned` не держит и не обнуляется — обращение после освобождения = краш.",
d:["Счётчики (strong, unowned, weak) хранятся в объекте/side table; retain/release — атомарные, поэтому не бесплатны.","`weak` — когда объект может умереть раньше (делегат, родитель, self в замыкании).","`unowned` — когда объект гарантированно живёт не меньше (дочерний объект, созданный и принадлежащий владельцу). Плюс: не Optional.","`unowned(unsafe)` — без проверок, как `assign` в Obj-C: висячий указатель.","Проверка утечки: `deinit` не вызвался → Memory Graph Debugger / Instruments Leaks."],
ex:[{n:"weak разрывает цикл",c:R`
final class Owner { var pet: Pet?;  deinit { print("Owner deinit") } }
final class Pet   { weak var owner: Owner?; deinit { print("Pet deinit") } }

var o: Owner? = Owner()
o!.pet = Pet()
o!.pet!.owner = o
o = nil
// Owner deinit
// Pet deinit
// Без weak — ничего не напечатается (цикл)`},
{n:"unowned: двухфазная инициализация и краш",c:R`
final class Customer {
    var card: Card!
    init() { card = Card(owner: self) }   // можно: card — IUO (= nil), все свойства уже заданы
}
final class Card { unowned let owner: Customer; init(owner: Customer) { self.owner = owner } }

var card: Card?
do { let c = Customer(); card = c.card }   // Customer освобождён
// print(card!.owner)   // 💥 краш: Attempted to read an unowned reference but object was already deallocated`}]},
{t:"Retain cycle в замыканиях",call:"Объект хранит escaping-замыкание, замыкание сильно захватывает self → цикл. Лечится `[weak self]`. Подвох: после `guard let self` во внешнем замыкании вложенное сохранённое замыкание снова захватит self сильно — нужен ещё один `[weak self]`.",
d:["Цикл возникает только если замыкание кто-то хранит (свойство, массив хендлеров, таймер, NotificationCenter-токен).","Non-escaping (`map`, `forEach`) — цикла нет. `UIView.animate` — escaping, но UIKit не хранит блок после анимации → `[weak self]` не нужен.","`DispatchQueue.main.asyncAfter { self... }` — не цикл, а продление жизни: код выполнится на уже закрытом экране.","`Timer.scheduledTimer(target: self…)` держит target сильно, а RunLoop держит таймер → `invalidate()` обязателен.","`let c = a.closure; a = nil` — объект умрёт, но замыкание живёт в `c`; с `unowned self` внутри вызов крашнется, с `weak` — nil."],
ex:[{n:"Вложенное замыкание после guard let self",c:R`
final class ProfileVC {
    var handler: (() -> Void)?
    func render() {}
    func setup(api: API) {
        api.load { [weak self] in
            guard let self else { return }
            self.handler = { self.render() }                 // ❌ цикл: VC → handler → VC
            self.handler = { [weak self] in self?.render() } // ✅
        }
    }
    deinit { print("deinit") }
}`},
{n:"Timer держит target",c:R`
final class Ticker {
    var timer: Timer?
    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }
    func tick() {}
    func stop() { timer?.invalidate() }   // без invalidate таймер живёт в RunLoop вечно
}`}]},
{t:"Capture list: 3 3 3 vs 0 1 2",call:"Замыкание захватывает переменную (ссылку на её ячейку), а не значение. `[x]` копирует значение в момент создания замыкания. `for j in` создаёт новую `j` на каждую итерацию, а внешняя `var i` с `while` — одна на все замыкания.",
d:["Где объявлена `var`, там она и «рождается»: одна переменная на все замыкания → общее значение.","`[obj]` копирует ссылку: изменения свойств объекта видны, переприсваивание переменной — нет.","`makeCounter()` — каждая новая `count` своя, счётчики независимы.","Escaping-замыкание не может захватить `inout` или `mutating self` — они живут только на время вызова."],
ex:[{n:"while vs for",c:R`
var closures: [() -> Void] = []
var i = 0
while i < 3 {
    closures.append { print(i) }
    i += 1
}
closures.forEach { $0() }   // 3 3 3

closures = []
for j in 0..<3 { closures.append { print(j) } }
closures.forEach { $0() }   // 0 1 2`},
{n:"[x] — снимок значения",c:R`
var x = 1
let live = { print(x) }
let snap = { [x] in print(x) }
x = 2
live()   // 2
snap()   // 1`},
{n:"Счётчик",c:R`
func makeCounter() -> () -> Int {
    var count = 0
    return { count += 1; return count }
}
let a = makeCounter(), b = makeCounter()
print(a(), a(), b())   // 1 2 1`}]},
{t:"lazy var с self",call:"`lazy var f: () -> Void = { self... }` хранит само замыкание → после первого обращения цикл, нужен `[weak self]`. `lazy var label = { ... }()` выполняется один раз, результат — не замыкание, утечки нет.",
d:["lazy-инициализатор может обращаться к `self`, потому что вызывается после init.","Различие в `()` на конце: с ним сохраняется результат, без — само замыкание.","lazy не потокобезопасен: при одновременном первом обращении из двух потоков инициализатор может выполниться дважды."],
ex:[{n:"",c:R`
final class Screen {
    let title = "Feed"
    lazy var label: UILabel = {           // ✅ выполнится один раз
        let l = UILabel(); l.text = self.title; return l
    }()
    lazy var onTap: () -> Void = { [weak self] in   // ✅ хранится замыкание → weak
        print(self?.title ?? "")
    }
}`}]},
{t:"Коллекции слабых ссылок",call:"Стандартно: `NSHashTable<AnyObject>.weakObjects()` (множество) и `NSMapTable` (словарь со слабыми ключами/значениями). На чистом Swift — обёртка `Weak<T>` с `weak var` и ручной чисткой nil.",
d:["`[weak]` массивов нет: `[Delegate]` держит элементы сильно.","NSHashTable/NSMapTable обнуляют элементы сами, но `count` может учитывать ещё не вычищенные — опираться на `allObjects`.","Обёртка `Weak<T>` не удаляется из массива сама — `compactMap`/`removeAll { $0.value == nil }`.","Типичная задача: мультикаст-делегаты / наблюдатели."],
ex:[{n:"NSHashTable",c:R`
protocol Listener: AnyObject { func didUpdate() }
final class Hub {
    private let listeners = NSHashTable<AnyObject>.weakObjects()
    func add(_ l: Listener) { listeners.add(l) }
    func notify() { listeners.allObjects.compactMap { $0 as? Listener }.forEach { $0.didUpdate() } }
}`},
{n:"Weak<T>",c:R`
struct Weak<T: AnyObject> { weak var value: T? }
var observers: [Weak<UIView>] = []
observers.append(Weak(value: someView))
observers.removeAll { $0.value == nil }   // чистка вручную`}]}
]});
