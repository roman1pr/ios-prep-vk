// Extra Swift core topics: Optional, extensions, errors, enums, access control, closures, property wrappers, KeyPath, Codable
S.find(s=>s.id==="swift").topics.push(
{t:"Optional: устройство и разворачивание",
call:"`Optional` — обычный enum: `case none`, `case some(Wrapped)`; `T?` и `nil` — сахар. Разворачивать: `if let` / `guard let` (с 5.7 коротко `if let x`), `??` с дефолтом (правая часть ленивая, autoclosure), optional chaining `a?.b` (результат всегда Optional), `!` — краш на nil. `T!` (IUO) — тот же Optional, который компилятор разворачивает неявно.",
tb:[{h:["Способ","Результат","Если nil","Когда"],r:[
["`if let x`","`x` не Optional внутри блока","блок пропускается","значение нужно в небольшой ветке"],
["`guard let x`","`x` доступен до конца scope","обязан выйти: return / throw / break","ранний выход, «счастливый путь» без вложенности"],
["`a ?? b`","не Optional (если `b` не Optional)","берётся `b`, вычисляется только тогда","есть разумный дефолт"],
["`a?.b?.c`","всегда Optional, не вкладывается","вся цепочка даёт nil","доступ через несколько Optional"],
["`a!`","не Optional","краш: Unexpectedly found nil","инвариант гарантирован (лучше `guard` + `preconditionFailure`)"],
["`T!` (IUO)","Optional, при использовании разворачивается неявно","краш при неявном развороте","`@IBOutlet`, двухфазная инициализация"],
["`switch` / `case let x?`","паттерн по `.some` / `.none`","ветка `case nil` / `.none`","разная логика на nil и значение"]]}],
d:["`Optional<Wrapped>` объявлен в stdlib как `enum Optional<Wrapped> { case none; case some(Wrapped) }`. `nil` — литерал (`ExpressibleByNilLiteral`), `Int?` = `Optional<Int>`.",
"Swift 5.7: `if let user { }` и `guard let user else { return }` — то же, что `if let user = user`.",
"`??` объявлен как `func ?? <T>(optional: T?, defaultValue: @autoclosure () throws -> T) rethrows -> T` — правая часть вычисляется только если слева nil. Есть перегрузка, где правая часть тоже Optional — тогда результат Optional.",
"Optional chaining: если звено nil — остальное не вызывается (побочные эффекты тоже). `user?.address?.zip` при `zip: String?` даёт `String?`, а не `String??` — цепочка «сплющивается». Вызов метода, возвращающего Void, через `?.` даёт `Void?` — так можно узнать, был ли вызов.",
"Force unwrap `!` на nil — runtime trap (краш), не исключение, поймать нельзя.",
"IUO: с Swift 4.2 `T!` — не отдельный тип, а `T?` с атрибутом «можно развернуть неявно». `let y = iuo` выводит `y` как `T?`; неявно разворачивается только там, где нужен `T`. Типично: `@IBOutlet weak var label: UILabel!`.",
"`map` на Optional: замыкание `Wrapped -> U` → `U?`. `flatMap`: замыкание `Wrapped -> U?` → `U?` (без двойного Optional). `compactMap` — метод последовательностей: отбрасывает nil из результатов.",
"Сопоставление: `case .some(let x)`, короче `case let x?`; `case nil` ловит отсутствие. В `for case let x? in array` — перебор только не-nil.",
"`Optional` — `Equatable`/`Hashable`/`Codable`, если `Wrapped` такой же. Сравнить с `nil` через `== nil` можно для любого Optional, даже если `Wrapped` не Equatable (отдельная перегрузка с `_OptionalNilComparisonType`)."],
ex:[{n:"Разворачивание и ленивый ??",c:R`
func loadDefault() -> String { print("loadDefault called"); return "guest" }

let name: String? = "Roman"
let a = name ?? loadDefault()      // loadDefault НЕ вызывается
let none: String? = nil
let b = none ?? loadDefault()      // печатает "loadDefault called"
print(a, b)                        // Roman guest

func greet(_ name: String?) {
    guard let name else { print("no name"); return }   // Swift 5.7
    print("hi, \(name)")
}
greet(nil)        // no name
greet("Kate")     // hi, Kate
`},{n:"Optional — это enum",c:R`
let x: Int? = 5
switch x {
case .some(let v): print("some", v)   // some 5
case .none:        print("none")
}
switch x {
case let v? where v > 3: print("big", v)   // big 5
case let v?:            print("small", v)
case nil:               print("nil")
}
let values: [Int?] = [1, nil, 3]
for case let v? in values { print(v) }       // 1  3
print(values.compactMap { $0 })               // [1, 3]
`},{n:"Chaining, map, flatMap",c:R`
struct Address { var zip: String? }
struct User { var address: Address? }

let u: User? = User(address: Address(zip: "101000"))
let zip = u?.address?.zip         // String?  (не String??)
print(zip ?? "-")                 // 101000

let s: String? = "42"
print(s.map { $0.count })         // Optional(2)
print(s.map { Int($0) })          // Optional(Optional(42))  — Int??
print(s.flatMap { Int($0) })      // Optional(42)            — Int?

let iuo: Int! = 7
let y = iuo          // y: Int?  — IUO не протекает дальше
let z: Int = iuo     // неявный разворот, z == 7
print(y as Any, z)   // Optional(7) 7
`}]},
{t:"Optional: вложенность, память, ObjC",
call:"`T??` бывает реально: словарь `[K: V?]` вернёт `V??` (нет ключа vs ключ со значением nil). `try?` с Swift 5 не создаёт двойной Optional. `MemoryLayout<Int?>.size == 9` (8 + байт тега), а Optional ссылки на класс — 8: nil кодируется нулевым указателем (spare bits). В ObjC сообщение nil возвращает 0/nil, в Swift `!` на nil — краш; без `nullable`/`nonnull` ObjC-указатели импортируются как `T!`.",
tb:[{h:["","Swift","Objective-C"],r:[
["Обращение к nil","`x!` — краш; `x?.foo()` — nil","`[nil foo]` — ничего не происходит, возвращает 0 / nil / нули"],
["Где возможен nil","только у Optional-типов","любой указатель на объект"],
["Аннотации","—","`nullable` → `T?`, `nonnull` → `T`, без аннотаций → `T!`"],
["Область по умолчанию","—","`NS_ASSUME_NONNULL_BEGIN … END`: всё nonnull, nullable отмечать явно"],
["Нет объекта в коллекции","`nil` в `[T?]` можно","в NSArray / NSDictionary nil нельзя, вместо него `NSNull`"]]}],
d:["Вложенный Optional: `let d: [String: Int?] = [\"a\": nil]`. `d[\"a\"]` — `.some(nil)` (ключ есть, значение nil), `d[\"b\"]` — `nil` (ключа нет). `d[\"a\"] = nil` удаляет ключ; чтобы записать nil-значение: `d[\"a\"] = .some(nil)` или `d.updateValue(nil, forKey: \"a\")`.",
"`try?` до Swift 5 давал `T??` для функции, возвращающей `T?`; с Swift 5 (SE-0230) результат сплющивается до `T?`. Optional chaining тоже сплющивает.",
"Память: `MemoryLayout<Int?>.size == 9`, `stride == 16` — Int использует все 64 бита, нужен лишний байт под тег. `MemoryLayout<Bool?>.size == 1`, `MemoryLayout<UIView?>.size == 8` — тег прячется в неиспользуемые битовые паттерны (spare bits / extra inhabitants), nil = нулевой указатель.",
"`weak var` обязан быть Optional (`var` + `?`): после деинициализации объекта ARC ставит nil. `unowned` — не Optional (с Swift 5 можно и Optional).",
"ObjC → Swift: `- (nullable NSString *)title` → `String?`; `nonnull` → `String`; `_Nullable` / `_Nonnull` — та же аннотация в позиции типа (для блоков, указателей на указатели). Без аннотаций — `String!`: компилятор не знает, может ли быть nil.",
"Если ObjC-метод помечен `nonnull`, но вернул nil — в Swift будет некорректное значение и краш/UB позже; аннотации — это обещание, не проверка."],
ex:[{n:"Двойной Optional в словаре",c:R`
var d: [String: Int?] = ["a": nil, "b": 2]
print(d["a"] as Any)          // Optional(nil)   — ключ есть, значение nil
print(d["c"] as Any)          // nil             — ключа нет
if case .some(.none) = d["a"] { print("ключ есть, значение nil") }

d["b"] = nil                  // удаляет ключ "b"
d["c"] = .some(nil)           // записывает nil-значение
print(d.keys.sorted())        // ["a", "c"]
`},{n:"Размеры и try?",c:R`
import UIKit
print(MemoryLayout<Int>.size, MemoryLayout<Int?>.size, MemoryLayout<Int?>.stride)  // 8 9 16
print(MemoryLayout<Bool?>.size)     // 1
print(MemoryLayout<UIView?>.size)   // 8

func find() throws -> Int? { 1 }
let r = try? find()                 // Swift 5+: Int?  (раньше Int??)
print(type(of: r))                  // Optional<Int>
`},{n:"ObjC: аннотации",c:R`
// Header
NS_ASSUME_NONNULL_BEGIN
@interface Feed : NSObject
@property (nonatomic, copy) NSString *title;              // Swift: String
@property (nonatomic, copy, nullable) NSString *subtitle; // Swift: String?
- (nullable Feed *)nextPage;                              // Swift: Feed?
@end
NS_ASSUME_NONNULL_END

// Без аннотаций: - (NSString *)legacy;  → Swift: func legacy() -> String!
// ObjC: [nilFeed nextPage] вернёт nil без краша
`}]},
{t:"Extension: что это",
call:"Extension добавляет к существующему типу (даже чужому, из SDK) вычисляемые свойства, методы, `convenience init` (для struct — любой init, и memberwise сохраняется), subscript, вложенные типы и соответствие протоколу. Нельзя: stored-свойства экземпляра, переопределять существующие методы, designated init у класса, deinit. Методы в extension класса без `@objc` — static dispatch, в подклассе их не переопределить.",
tb:[{h:["Можно","Нельзя"],r:[
["вычисляемые свойства (экземпляра и static)","stored-свойства экземпляра (static stored — можно)"],
["методы, `mutating` методы у struct","переопределить метод самого типа"],
["`convenience init` у класса; любой init у struct (memberwise остаётся)","designated init у класса, `deinit`"],
["subscript, вложенные типы","добавить observers (`didSet`) к существующему свойству"],
["соответствие протоколу, `where`-ограничения","переопределять в подклассе метод из extension (без `@objc`)"]]}],
d:["Зачем: разбить тип по смыслу — одно соответствие протоколу на extension (`extension VC: UITableViewDataSource`), добавить утилиты к чужим типам.",
"Struct: init в extension не убирает memberwise init. Если написать init в теле struct — memberwise пропадёт.",
"Методы, объявленные в extension класса (не `@objc`), вызываются статически, поэтому подкласс не может их `override`. С `@objc` (класс от NSObject) — message dispatch и override разрешён.",
"Generic-тип: `extension Array where Element: Numeric { func sum() -> Element }` — метод есть только у подходящих массивов. Условное соответствие: `extension Box: Equatable where T: Equatable {}`.",
"Extension протокола даёт default-реализации. Метод, которого нет в объявлении протокола, вызывается статически по типу переменной — см. «Протоколы и диспетчеризация в extension» и «Четыре вида диспетчеризации».",
"Доступ: модификатор на extension (`private extension Foo`) применяется к членам по умолчанию. С Swift 4 `private` члены видны в extension того же типа в том же файле.",
"Аналог в ObjC — категория (`@interface UIView (Shake)`): тоже нет ivar; stored-свойство эмулируют associated objects (`objc_setAssociatedObject`). В ObjC категория может молча заменить метод класса — в Swift так нельзя."],
ex:[{n:"Что можно добавить",c:R`
struct Point { var x: Double; var y: Double }

extension Point {
    init(_ v: Double) { self.init(x: v, y: v) }      // memberwise остаётся
    var length: Double { (x * x + y * y).squareRoot() }
    static let zero = Point(x: 0, y: 0)               // static stored — можно
    mutating func scale(_ k: Double) { x *= k; y *= k }
    subscript(i: Int) -> Double { i == 0 ? x : y }
    enum Quadrant { case first, other }
}

var p = Point(x: 3, y: 4)
print(p.length, p[1])        // 5.0 4.0
p.scale(2); print(p.x)       // 6.0
print(Point(1).y)            // 1.0
// extension Point { var z = 0.0 }   // error: extensions must not contain stored properties
`},{n:"where и условное соответствие",c:R`
extension Array where Element: Numeric {
    func sum() -> Element { reduce(0, +) }
}
print([1, 2, 3].sum())        // 6
// ["a"].sum()                // error: requires Element: Numeric

struct Box<T> { let value: T }
extension Box: Equatable where T: Equatable {}
print(Box(value: 1) == Box(value: 1))   // true
`},{n:"Static dispatch в extension класса",c:R`
class Base {}
extension Base { func hello() { print("Base") } }

class Child: Base {
    // override func hello() {}   // error: non-@objc declarations in extensions cannot be overridden
}
Child().hello()               // Base

import Foundation
class ObjBase: NSObject {}
extension ObjBase { @objc func hello() { print("ObjBase") } }
class ObjChild: ObjBase { override func hello() { print("ObjChild") } }
let o: ObjBase = ObjChild()
o.hello()                     // ObjChild — message dispatch
`}]},
{t:"Ошибки: throws, rethrows, Result, typed throws",
call:"Ошибка — значение типа, соответствующего `Error`; `throws` — это скрытый дополнительный возврат, не исключение с раскруткой стека. Вызов только через `try` (`try?` → Optional, `try!` → краш). `rethrows` — функция бросает, только если бросает переданное замыкание. `Result<Success, Failure>` — ошибка как значение (колбэки, хранение). Swift 6: typed throws `throws(MyError)` — в `catch` сразу `MyError`.",
tb:[{h:["","`throws`","`throws(E)`","`Result`","`try?`"],r:[
["Тип ошибки","`any Error`","конкретный `E`","конкретный `Failure`","теряется"],
["Как обработать","`do / catch`","`do / catch`, `error` уже `E`","`switch`, `get()`, `map`","`if let` / `??`"],
["Хранить / передать в колбэк","нет","нет","да","—"],
["С async","`async throws`","`async throws(E)`","обычно не нужен","—"],
["Когда","по умолчанию","закрытый набор ошибок, embedded, generic-код","колбэки, отложенная обработка","ошибка не важна"]]}],
d:["`do { try f() } catch let e as NetworkError { } catch { }` — последний `catch` без паттерна ловит всё, внутри неявная `error`.",
"`defer` выполняется при любом выходе из scope, в том числе при throw; несколько `defer` — в обратном порядке.",
"`rethrows`: `map`, `filter`, `sorted(by:)` объявлены `rethrows` — с небросающим замыканием `try` не нужен.",
"`Result`: `try result.get()` превращает обратно в throw; `Result { try f() }` — из throwing-кода в значение; `map`, `flatMap`, `mapError`.",
"Typed throws (Swift 6, SE-0413): `throws(E)`; `throws` = `throws(any Error)`, `throws(Never)` = не бросает. Нельзя смешать два типа ошибок — придётся обернуть в один enum.",
"Ошибки в Swift дешёвые: нет раскрутки стека как в C++/ObjC `@throw`. NSError из ObjC (`NSError **`) импортируется как `throws`."],
ex:[{n:"throws, defer, rethrows",c:R`
enum ParseError: Error { case empty, notNumber(String) }

func parse(_ s: String) throws -> Int {
    defer { print("parse done: \(s)") }
    guard !s.isEmpty else { throw ParseError.empty }
    guard let n = Int(s) else { throw ParseError.notNumber(s) }
    return n
}

do {
    print(try parse("42"))       // parse done: 42  →  42
    _ = try parse("x")           // parse done: x
} catch ParseError.notNumber(let s) {
    print("not a number:", s)    // not a number: x
} catch {
    print("other:", error)
}
print(try? parse("") as Any)     // parse done:  →  nil

let lens = ["a", "bb"].map { $0.count }   // map rethrows: try не нужен
let nums = try ["1", "2"].map(parse)       // здесь нужен try; печатает parse done: 1, parse done: 2
print(lens, nums)                          // [1, 2] [1, 2]
`},{n:"Result и typed throws",c:R`
func load(_ ok: Bool, completion: (Result<String, ParseError>) -> Void) {
    completion(ok ? .success("data") : .failure(.empty))
}
load(false) { result in
    switch result {
    case .success(let s): print(s)
    case .failure(let e): print("failed:", e)   // failed: empty
    }
}

func check(_ n: Int) throws(ParseError) -> Int {   // Swift 6
    if n < 0 { throw .notNumber(String(n)) }
    return n
}
do { _ = try check(-1) }
catch { print(type(of: error)) }   // ParseError — без каста
`}]},
{t:"Enum с associated values",
call:"Каждый case может нести свои данные: `case success(Data)`, `case failure(Error)`. Raw value — одна константа на case одного типа; associated values — разные данные на каждый экземпляр (одновременно с raw values через `: String` нельзя). Рекурсивный enum — `indirect`. Размер = самый большой payload + тег (если тег не влез в spare bits).",
tb:[{h:["","Raw value","Associated values"],r:[
["Что","константа, одна на case","данные экземпляра"],
["Объявление","`enum Color: String { case red }`","`case loaded([Item])`"],
["Создание из значения","`Color(rawValue: \"red\")` → Optional","нет"],
["CaseIterable","синтезируется","не синтезируется"],
["Equatable / Hashable","автоматически","синтез, если payload соответствуют"]]}],
d:["Извлечение: `switch`, `if case .loaded(let items) = state`, `guard case`. Switch должен быть исчерпывающим — новый case ломает компиляцию, это плюс.",
"Моделирование состояния экрана: `enum State { case idle, loading, loaded([Item]), failed(Error) }` — невозможные комбинации (loading + error) не выразить.",
"`indirect case node(Tree, Tree)` — payload хранится в куче (box), иначе размер был бы бесконечным.",
"`@frozen` / `@unknown default`: для enum из SDK switch требует `@unknown default`, т.к. Apple может добавить case."],
ex:[{n:"Состояние и рекурсия",c:R`
enum LoadState {
    case idle, loading
    case loaded([String])
    case failed(message: String)
}
let s = LoadState.loaded(["a", "b"])
if case .loaded(let items) = s { print(items.count) }   // 2
switch LoadState.failed(message: "timeout") {
case .failed(let m): print("error:", m)                 // error: timeout
default: break
}

indirect enum Expr {
    case num(Int)
    case add(Expr, Expr)
    func eval() -> Int {
        switch self {
        case .num(let n): return n
        case let .add(a, b): return a.eval() + b.eval()
        }
    }
}
print(Expr.add(.num(2), .add(.num(3), .num(4))).eval())  // 9
`}]},
{t:"Access control",
call:"От открытого к закрытому: `open` (наследование и override вне модуля) → `public` (виден снаружи, но не наследуется / не переопределяется вне модуля) → `package` (Swift 5.9, внутри пакета) → `internal` (по умолчанию, модуль) → `fileprivate` (файл) → `private` (scope и extension того же типа в этом файле). `private(set)` — читать можно, писать нет.",
tb:[{h:["Уровень","Видно","Наследование / override снаружи"],r:[
["`open`","везде","да (только классы и их члены)"],
["`public`","везде","нет"],
["`package`","модули одного пакета","нет"],
["`internal`","свой модуль (по умолчанию)","—"],
["`fileprivate`","свой файл","—"],
["`private`","объявление + extension того же типа в файле","—"]]}],
d:["`final` + `private`/`fileprivate` помогают компилятору сделать static dispatch; WMO выводит final для internal-классов без наследников.",
"Тип не может быть «шире» своих частей: public-функция не может принимать internal-тип.",
"`@testable import` открывает internal для тестов (модуль собран с testability).",
"`public private(set) var count` — частый паттерн для моделей."],
ex:[{n:"private(set) и private в extension",c:R`
public struct Counter {
    public private(set) var value = 0
    private var log: [Int] = []
    public init() {}
    public mutating func inc() { value += 1; record() }
}
extension Counter {
    private mutating func record() { log.append(value) }  // видит private log (тот же файл)
}
var c = Counter()
c.inc()
print(c.value)      // 1
// c.value = 10     // error: setter is inaccessible
`}]},
{t:"Замыкания: @escaping и @autoclosure",
call:"Параметр-замыкание по умолчанию non-escaping: вызывается до возврата функции и не сохраняется (`map`, `forEach`) — `[weak self]` не нужен. `@escaping` — может пережить вызов (сохранить, async-колбэк), тут возможны retain cycle и нужен явный `self`. Optional-замыкание всегда escaping. `@autoclosure` превращает выражение аргумента в замыкание — вычисление откладывается (`??`, `assert`).",
tb:[{h:["","non-escaping","`@escaping`"],r:[
["Время жизни","только во время вызова","может пережить вызов"],
["Сохранить в свойство","нельзя","можно"],
["`self.` в классе","можно не писать","нужен явный `self` или `[self]`"],
["Retain cycle","невозможен","возможен → `[weak self]`"],
["Примеры","`map`, `filter`, `sorted(by:)`","completion, `DispatchQueue.async`, хранимый handler"]]}],
d:["Optional-параметр `(() -> Void)?` неявно escaping — `@escaping` писать нельзя и не нужно.",
"`@autoclosure`: `func log(_ m: @autoclosure () -> String)` — `log(expensive())` не вычислит `expensive()`, если лог выключен.",
"Захват: замыкание захватывает переменные по ссылке (видит последние значения); capture list `[x]` копирует значение в момент создания.",
"Чтобы передать non-escaping замыкание туда, где нужен escaping (на время вызова), есть `withoutActuallyEscaping`."],
ex:[{n:"escaping и autoclosure",c:R`
var handlers: [() -> Void] = []
func later(_ f: @escaping () -> Void) { handlers.append(f) }
func now(_ f: () -> Void) { f() }

now { print("now") }          // now
later { print("later") }
handlers.forEach { $0() }     // later

var debug = false
func log(_ msg: @autoclosure () -> String) { if debug { print(msg()) } }
func expensive() -> String { print("computed"); return "state" }
log(expensive())              // ничего: expensive() не вызвана
debug = true
log(expensive())              // computed  →  state
`}]},
{t:"Property wrappers и KeyPath",
call:"Property wrapper (`@propertyWrapper`) выносит логику хранения свойства в тип с `wrappedValue`; `projectedValue` доступен через `$` (так устроены `@State` и `$binding`). KeyPath — типизированная ссылка на свойство: `\\User.name`; бывают `KeyPath` (чтение), `WritableKeyPath` (запись в value-тип), `ReferenceWritableKeyPath` (запись в класс). С Swift 5.2 KeyPath можно передать как функцию: `users.map(\\.name)`.",
d:["Компилятор разворачивает `@Clamped var v` в приватное хранилище `_v: Clamped` и вычисляемое `v { _v.wrappedValue }`.",
"Обёртки не работают как stored в extension и на глобальных `let`; можно на локальных переменных (Swift 5.4+).",
"KeyPath используются в SwiftUI (`ForEach(items, id: \\.id)`), Combine (`assign(to:on:)`), KVO (`observe(\\.title)`), сортировке: `sorted { $0[keyPath: kp] < $1[keyPath: kp] }`.",
"`\\.self` — путь к самому значению."],
ex:[{n:"Своя обёртка и KeyPath",c:R`
@propertyWrapper
struct Clamped {
    private var value: Int
    let range: ClosedRange<Int>
    init(wrappedValue: Int, _ range: ClosedRange<Int>) {
        self.range = range
        value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }
    var wrappedValue: Int {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
    var projectedValue: ClosedRange<Int> { range }
}
struct Volume { @Clamped(0...10) var level = 5 }

var v = Volume()
v.level = 42
print(v.level, v.$level)          // 10 0...10

struct User { var name: String; var age: Int }
var users = [User(name: "Ann", age: 30), User(name: "Bob", age: 25)]
print(users.map(\.name))          // ["Ann", "Bob"]
let kp: WritableKeyPath<User, Int> = \.age
users[0][keyPath: kp] += 1
print(users.sorted { $0.age < $1.age }.map(\.name), users[0].age)  // ["Bob", "Ann"] 31
`}]},
{t:"Codable",
call:"`Codable` = `Encodable & Decodable`; компилятор синтезирует реализацию, если все свойства Codable. Имена ключей — `CodingKeys` или `decoder.keyDecodingStrategy = .convertFromSnakeCase`. Optional-свойство: отсутствующий ключ или null → nil; не-Optional без ключа → `DecodingError.keyNotFound`. Нестандартный JSON — свой `init(from:)`.",
d:["Ошибки: `keyNotFound`, `typeMismatch`, `valueNotFound` (null в не-Optional), `dataCorrupted` — у каждой есть `codingPath`, удобно логировать.",
"Дефолт для отсутствующего ключа: свой `init(from:)` с `decodeIfPresent(...) ?? default`. Синтезированный init не подставляет начальное значение `var likes = 0` — без ключа будет `keyNotFound`; а `let` с начальным значением вообще не декодируется.",
"Даты: `dateDecodingStrategy = .iso8601` / `.secondsSince1970`.",
"Enum с raw value декодируется по значению; неизвестное значение → ошибка, поэтому для API иногда делают `case unknown` и свой init."],
ex:[{n:"snake_case, Optional и дефолт",c:R`
import Foundation
struct Post: Decodable {
    let id: Int
    let title: String
    let authorName: String?
    let likes: Int
    enum CodingKeys: String, CodingKey { case id, title, authorName, likes }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        authorName = try c.decodeIfPresent(String.self, forKey: .authorName)
        likes = try c.decodeIfPresent(Int.self, forKey: .likes) ?? 0
    }
}
let json = #"{"id": 1, "title": "Hi", "author_name": null}"#.data(using: .utf8)!
let d = JSONDecoder()
d.keyDecodingStrategy = .convertFromSnakeCase
let p = try d.decode(Post.self, from: json)
print(p.title, p.authorName as Any, p.likes)   // Hi nil 0
`}]}
);
