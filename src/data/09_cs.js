put({id:"cs",t:"CS и коллекции",topics:[
{t:"Таблица сложностей",call:"Array: доступ по индексу O(1), append амортизированно O(1), insert/remove в начало/середину O(n), поиск O(n). Dictionary/Set: вставка, поиск, удаление — в среднем O(1), в худшем O(n) при коллизиях. Сортировка O(n log n).",
d:["«Амортизированно O(1)»: при нехватке capacity буфер растёт в ~2 раза и копируется (O(n)), но редко → в среднем O(1) на операцию.","Хэш-таблица деградирует при плохом `hash(into:)` (все в одну корзину). Хэш и `==` должны быть согласованы.","`String.count` — O(n): символы (Character) разной длины в байтах; индекс — `String.Index`, не Int.","`removeFirst()` у Array — O(n); `popLast()`/`removeLast()` — O(1).","`contains` у Array O(n), у Set O(1) → для частых проверок перевести в Set."],
ex:[{n:"Шпаргалка",c:R`
Структура        доступ    поиск     вставка          удаление
Array            O(1)      O(n)      O(1)* конец      O(1) конец
                                     O(n) середина    O(n) середина
Dictionary/Set   —         O(1)~     O(1)~            O(1)~
Sorted array     O(1)      O(log n)  O(n)             O(n)
Linked list      O(n)      O(n)      O(1) у узла      O(1) у узла
Heap             O(1) top  O(n)      O(log n)         O(log n) top
Balanced BST     —         O(log n)  O(log n)         O(log n)
Deque            O(1)      O(n)      O(1) концы       O(1) концы
* амортизированно, ~ в среднем`}]},
{t:"Вставка в массив: что происходит",call:"`insert(x, at: i)` сдвигает все элементы с i до конца на одну позицию вправо — n−i перемещений, O(n). Если capacity закончился — сначала выделяется новый буфер (обычно ×2) и всё копируется. Плюс COW: если буфер общий — полная копия.",
d:["Вставка в начало — худший случай: сдвиг всех n.","`reserveCapacity(n)` заранее — без промежуточных реаллокаций при известном размере.","Много вставок в начало → Deque или собрать в обратном порядке и `reverse()` (O(n) один раз).","Удаление в середине — симметрично, сдвиг влево; `removeAll(where:)` — O(n) за один проход, а не O(n²) циклом с `remove(at:)`."],
ex:[{n:"Сдвиг по шагам",c:R`
var a = [10, 20, 30, 40, 50]   // count 5
a.insert(99, at: 1)
// 50 → индекс 5, 40 → 4, 30 → 3, 20 → 2  (4 сдвига = n − i)
// 99 → индекс 1
print(a)   // [10, 99, 20, 30, 40, 50]`},
{n:"Capacity",c:R`
var b: [Int] = []
var caps: [Int] = []
for i in 0..<20 {
    b.append(i)
    if caps.last != b.capacity { caps.append(b.capacity) }
}
print(caps)   // рост примерно ×2 (точные числа зависят от аллокатора — посмотри в Playground)

var c: [Int] = []
c.reserveCapacity(1000)   // одна аллокация`},
{n:"O(n²) vs O(n)",c:R`
var xs = Array(0..<10)
// ❌ O(n²): каждый remove(at:) сдвигает хвост
var i = 0
while i < xs.count { if xs[i] % 2 == 0 { xs.remove(at: i) } else { i += 1 } }
// ✅ O(n)
var ys = Array(0..<10)
ys.removeAll { $0 % 2 == 0 }
print(xs, ys)   // [1, 3, 5, 7, 9] [1, 3, 5, 7, 9]`}]},
{t:"Сортировка",call:"`sort()`/`sorted()` в Swift — стабильная модификация Timsort (с Swift 5): O(n log n), O(n) на почти отсортированных данных, дополнительная память O(n). Стабильность — равные элементы сохраняют исходный порядок.",
d:["Стабильность официально гарантирована документацией (с Swift 5.x), раньше был introsort — нестабильный.","Сортировка по нескольким ключам: кортежи сравниваются лексикографически `(a.age, a.name) < (b.age, b.name)`.","Топ-k из n: не сортировать всё (O(n log n)), а heap размером k — O(n log k).","Бинпоиск — только на отсортированном; `partitioningIndex` есть в swift-algorithms."],
ex:[{n:"Стабильность и несколько ключей",c:R`
struct P { let name: String; let age: Int }
let people = [P(name: "Аня", age: 30), P(name: "Боря", age: 25), P(name: "Вера", age: 30)]

print(people.sorted { $0.age < $1.age }.map(\.name))
// ["Боря", "Аня", "Вера"]  — Аня осталась перед Верой (стабильно)

print(people.sorted { ($0.age, $0.name) > ($1.age, $1.name) }.map(\.name))
// ["Вера", "Аня", "Боря"]`},
{n:"Бинарный поиск",c:R`
func binarySearch(_ a: [Int], _ x: Int) -> Int? {
    var lo = 0, hi = a.count - 1
    while lo <= hi {
        let mid = lo + (hi - lo) / 2
        if a[mid] == x { return mid }
        if a[mid] < x { lo = mid + 1 } else { hi = mid - 1 }
    }
    return nil
}
print(binarySearch([1, 3, 5, 7, 9], 7) ?? -1)   // 3`}]},
{t:"Деревья: BFS и DFS (UIView на глубине N)",call:"DFS — рекурсия или стек, идёт вглубь; BFS — очередь, идёт по уровням. Для «все view на глубине N» удобен BFS по уровням или DFS с уменьшением depth. Время O(узлов до глубины N), память — O(высота) для DFS, O(ширина уровня) для BFS.",
d:["Очередь в Swift — массив + индекс head; `removeFirst()` делает BFS O(n²).","Рекурсия на очень глубоком дереве может переполнить стек — итеративный DFS со стеком.","Порядок результата: DFS — по ветвям, BFS по уровням — слева направо.","Граф (не дерево) — нужен `visited: Set` от циклов."],
ex:[{n:"DFS рекурсивно",c:R`
func views(at depth: Int, in root: UIView) -> [UIView] {
    guard depth >= 0 else { return [] }
    if depth == 0 { return [root] }
    return root.subviews.flatMap { views(at: depth - 1, in: $0) }
}`},
{n:"BFS по уровням",c:R`
func viewsBFS(at depth: Int, in root: UIView) -> [UIView] {
    guard depth >= 0 else { return [] }
    var level = [root]
    for _ in 0..<depth {
        level = level.flatMap(\.subviews)
        if level.isEmpty { break }
    }
    return level
}`},
{n:"Очередь с head-индексом и тест на простом дереве",c:R`
final class Node { let v: Int; var kids: [Node]; init(_ v: Int, _ k: [Node] = []) { self.v = v; kids = k } }
let root = Node(1, [Node(2, [Node(4), Node(5)]), Node(3, [Node(6)])])

func bfs(_ root: Node) -> [Int] {
    var queue = [root], head = 0, out: [Int] = []
    while head < queue.count {
        let n = queue[head]; head += 1
        out.append(n.v)
        queue.append(contentsOf: n.kids)
    }
    return out
}
func dfs(_ n: Node) -> [Int] { [n.v] + n.kids.flatMap(dfs) }

print(bfs(root))   // [1, 2, 3, 4, 5, 6]
print(dfs(root))   // [1, 2, 4, 5, 3, 6]`}]},
{t:"Hashable, Equatable, свои ключи",call:"Ключ Dictionary/элемент Set должен быть `Hashable`: равные объекты обязаны иметь равный хэш. Для struct с Hashable-полями — синтез автоматически; для своей логики равенства — хэшировать те же поля, что сравниваются в `==`.",
d:["Хэш в Swift рандомизирован на запуск (seed) — не сохранять `hashValue` между запусками.","Мутировать объект-ключ (класс) после вставки в Set — элемент «теряется».","Для классов часто равенство по идентичности: `ObjectIdentifier(self)`."],
ex:[{n:"",c:R`
struct User: Hashable {
    let id: Int
    var name: String
    static func == (a: User, b: User) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }   // только id, как в ==
}
let s: Set = [User(id: 1, name: "A"), User(id: 1, name: "B")]
print(s.count)   // 1`}]}
]});
