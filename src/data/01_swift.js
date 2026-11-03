put({id:"swift",t:"Swift core",topics:[
{t:"Value vs reference, COW",call:"Struct/enum копируются при присваивании, class — общая ссылка. Коллекции stdlib (Array, Dictionary, Set, String) делают реальную копию буфера только при мутации неуникального буфера — copy-on-write. Поле-класс внутри struct остаётся общим.",
d:["Копия struct копирует поля: value-поля — по значению, поле-класс — только ссылку (объект общий).","COW не «магия struct», а реализация конкретных типов: внутри Array лежит ссылка на буфер в куче; при мутации проверяется `isKnownUniquelyReferenced`, и если ссылок > 1 — буфер копируется.","Свои struct получают COW только если вы сами его реализуете (обёртка над классом + проверка уникальности).","Подвох: `let` у struct запрещает мутацию полей, но у `let` на класс можно менять свойства объекта.","`isKnownUniquelyReferenced` принимает `inout` и работает только с Swift-классами."],
ex:[{n:"Struct с массивом и полем-классом",c:R`
final class Counter { var value = 0 }
struct State {
    var items = [1]
    let box = Counter()
}
var a = State()
var b = a
b.items.append(2)     // COW: у b теперь свой буфер
b.box.value = 10      // объект общий
print(a.items, a.box.value)  // [1] 10
print(b.items, b.box.value)  // [1, 2] 10`},
{n:"Свой COW через isKnownUniquelyReferenced",c:R`
final class Storage { var values: [Int]; init(_ v: [Int]) { values = v } }

struct MyList {
    private var storage = Storage([])
    var values: [Int] { storage.values }

    mutating func append(_ x: Int) {
        if !isKnownUniquelyReferenced(&storage) {
            storage = Storage(storage.values)   // копия только при общей ссылке
        }
        storage.values.append(x)
    }
}
var l1 = MyList(); l1.append(1)
var l2 = l1          // общий storage
l2.append(2)         // здесь копия
print(l1.values, l2.values)  // [1] [1, 2]`}]},
{t:"Struct vs class",call:"Struct — value-тип: копируется, без наследования, без deinit, мутации через mutating. Class — reference: идентичность (===), наследование, deinit, ARC. По умолчанию struct; class — когда нужна идентичность или общее изменяемое состояние.",
d:["Class: подсчёт ссылок (retain/release — атомарные операции), аллокация в куче, возможны retain cycles.","Struct: обычно на стеке/инлайн, но может попасть в кучу (захват в escaping-замыкание, existential больше 3 слов, поля-коллекции).","Методы struct диспетчеризуются статически; у class — через vtable, если не `final`.","Struct с `let`-экземпляром нельзя мутировать; `mutating func` получает `self` как `inout`.","Для Sendable: struct из Sendable-полей автоматически Sendable (если не public), класс — только `final` с `let`-полями или с синхронизацией."],
ex:[{n:"Разница в поведении копии",c:R`
struct PointS { var x = 0 }
final class PointC { var x = 0 }

var s1 = PointS(); var s2 = s1; s2.x = 5
let c1 = PointC(); let c2 = c1; c2.x = 5
print(s1.x, c1.x)   // 0 5
print(c1 === c2)    // true`}]},
{t:"Протоколы и диспетчеризация в extension (задача P/C/S)",call:"Метод, объявленный в протоколе (requirement), вызывается динамически через witness table — выполнится реализация типа. Метод, который есть только в extension протокола, вызывается статически по объявленному типу переменной.",
d:["Requirement → запись в protocol witness table → `any P` вызовет реализацию конкретного типа.","Не requirement (только в `extension P`) → статический вызов: через `any P` всегда реализация из extension, даже если у типа есть свой метод с тем же именем.","Ловушка с наследованием: если базовый класс берёт дефолтную реализацию из extension, witness table базового класса указывает на дефолт; переопределение в подклассе через `any P` не вызовется.","Ответ на нашу задачу: без requirement — protocol / class / protocol; с requirement — class / class / struct."],
ex:[{n:"Requirement vs только extension",c:R`
protocol P { func a() }               // a — requirement
extension P {
    func a() { print("P.a") }
    func b() { print("P.b") }         // b — только в extension
}
struct S: P {
    func a() { print("S.a") }
    func b() { print("S.b") }
}
let x: any P = S()
x.a()      // S.a  — witness table
x.b()      // P.b  — статически по типу any P
S().b()    // S.b  — статически по типу S`},
{n:"Ловушка с подклассом",c:R`
protocol Greeter { func hello() }
extension Greeter { func hello() { print("default") } }

class Base: Greeter {}                 // взял дефолт из extension
class Sub: Base { func hello() { print("Sub") } }  // не override!

let g: any Greeter = Sub()
g.hello()        // default
(Sub()).hello()  // Sub
// Фикс: объявить hello() в Base, а в Sub — override func hello()`}]},
{t:"Generics",call:"Обобщённый код с ограничениями (`<T: Equatable>`, `where`). Компилятор может специализировать функцию под конкретный тип — тогда вызовы статические и инлайнятся; без специализации функция получает метаданные типа и witness tables и вызывает через них.",
d:["Специализация — оптимизация `-O`, не гарантия: работает, когда тело видно (тот же модуль, WMO, `@inlinable`).","Без специализации: одна реализация на все T, в неё неявно передаются type metadata (размер, копирование) и witness table каждого протокола-ограничения.","`associatedtype` — «generic внутри протокола»: конкретный тип выбирает реализация (`Element` у `Sequence`).","Type erasure (`AnyPublisher`, `AnySequence`, свой `AnyCache<V>`) — способ спрятать конкретный тип; с Swift 5.7 часто заменяется на `any P<V>` (primary associated types).","Generic vs `any`: generic сохраняет тип и статичен, `any` стирает тип и всегда динамичен."],
ex:[{n:"Ограничения и where",c:R`
func maxElement<T: Comparable>(_ xs: [T]) -> T? {
    guard var m = xs.first else { return nil }
    for x in xs where x > m { m = x }
    return m
}
print(maxElement([3, 7, 1]) ?? -1)   // 7

func allEqual<C: Collection>(_ c: C) -> Bool where C.Element: Equatable {
    guard let f = c.first else { return true }
    return c.allSatisfy { $0 == f }
}
print(allEqual("aaa"))   // true`},
{n:"associatedtype + type erasure",c:R`
protocol Cache {
    associatedtype Value
    func get(_ key: String) -> Value?
}
final class StringCache: Cache {
    func get(_ key: String) -> String? { "hello" }  // Value = String
}
struct AnyCache<Value>: Cache {
    private let _get: (String) -> Value?
    init<C: Cache>(_ base: C) where C.Value == Value { _get = base.get }
    func get(_ key: String) -> Value? { _get(key) }
}
let caches: [AnyCache<String>] = [AnyCache(StringCache())]`}]},
{t:"some vs any, associatedtype",call:"`some P` — opaque type: один конкретный тип, известный компилятору и скрытый от вызывающего, вызовы статические. `any P` — existential: коробка, в которой в рантайме может лежать любой тип, вызовы через witness table. В Swift 6 `any` пишется обязательно.",
d:["Existential container: буфер на 3 слова (не влезло — в кучу) + метаданные + witness table → дороже по памяти и вызовам.","`some` в возврате: функция обязана вернуть один и тот же тип на всех путях.","Каждое `some` — отдельный тип: `var s: some Shape = Circle()` потом нельзя присвоить `Circle()` заново.","`any Equatable == any Equatable` не компилируется — внутри могут быть разные типы; решение — generic `<T: Equatable>(_ a: T, _ b: T)`.","Primary associated types (5.7+): `protocol Cache<Value>` → `any Cache<UIImage>`, `some Collection<Int>`."],
ex:[{n:"Где что компилируется",c:R`
protocol Shape { func area() -> Double }
struct Circle: Shape { var r: Double; func area() -> Double { .pi * r * r } }
struct Square: Shape { var a: Double; func area() -> Double { a * a } }

let shapes: [any Shape] = [Circle(r: 1), Square(a: 2)]   // ✅ разнородно
// let bad: [some Shape] = [Circle(r: 1), Square(a: 2)]  // ❌

// func make(_ round: Bool) -> some Shape { round ? Circle(r: 1) : Square(a: 1) } // ❌ два типа
func make(_ round: Bool) -> any Shape { round ? Circle(r: 1) : Square(a: 1) }    // ✅

func total(_ s: some Shape) -> Double { s.area() }  // = generic <T: Shape>`},
{n:"Self/Equatable и стирание",c:R`
// let a: any Equatable = 1; let b: any Equatable = "x"; a == b   // ❌
func same<T: Equatable>(_ a: T, _ b: T) -> Bool { a == b }     // ✅
print(same(1, 1))   // true`}]},
{t:"Как получить static dispatch",call:"`final` и `private`/`fileprivate` (нельзя переопределить), WMO (компилятор сам выводит final для internal), методы в extension класса, struct/enum, generics и `some` вместо `any`, `@inlinable` для кросс-модульной специализации. `dynamic`/`@objc dynamic` — наоборот, message dispatch.",
d:["Виды: static (прямой адрес, можно инлайнить) → vtable (class, overridable) → witness table (протоколы, `any`) → message dispatch (`objc_msgSend`, `dynamic`).","Методы в `extension` класса не попадают в vtable → статические (и их нельзя override без `@objc`).","WMO (Whole Module Optimization, по умолчанию в Release) видит весь модуль и делает internal-классы без наследников фактически final.","`@inline(__always)`, `@_specialize` (подчёркнутый, неофициальный) — точечные подсказки.","Влияние на собесе: static dispatch даёт инлайн и дальнейшие оптимизации, а не просто «на пару наносекунд быстрее»."],
ex:[{n:"",c:R`
class Feed: NSObject {
    final func reload() {}          // static
    private func log() {}           // static
    func render() {}                // vtable
    @objc dynamic func track() {}   // message dispatch (KVO/swizzling)
}
extension Feed { func helper() {} } // static, нельзя override

final class Cache {}                // все методы static`}]}
]});
