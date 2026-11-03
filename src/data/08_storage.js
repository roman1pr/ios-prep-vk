put({id:"storage",t:"Хранение и сеть",topics:[
{t:"Keychain",call:"Зашифрованное системное хранилище для секретов (токены, пароли). API — `SecItemAdd`/`SecItemCopyMatching`/`SecItemUpdate`/`SecItemDelete` со словарём атрибутов. Доступность задаётся `kSecAttrAccessible`, обмен между приложениями — access group.",
d:["`kSecAttrAccessibleAfterFirstUnlock` — доступно в фоне после первой разблокировки; `WhenUnlocked` — только при разблокированном устройстве; суффикс `ThisDeviceOnly` — не переносится в бэкап на другое устройство.","Элементы обычно переживают удаление приложения (документацией не гарантировано) — на первом запуске можно чистить по флагу в UserDefaults.","`errSecDuplicateItem` при повторном Add → делать Update или Delete+Add.","Вызовы потокобезопасны, но синхронные и не мгновенные — не дёргать на main в цикле.","Биометрия: `SecAccessControlCreateWithFlags(... .biometryCurrentSet ...)` + `LAContext`."],
ex:[{n:"Сохранить и прочитать токен",c:R`
import Security

enum Keychain {
    static func save(_ value: String, key: String) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)              // убрать старое
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }
}
_ = Keychain.save("abc123", key: "token")
print(Keychain.read("token") ?? "nil")   // abc123  (на устройстве/симуляторе)`}]},
{t:"UserDefaults",call:"Plist-хранилище настроек: маленькие значения (флаги, выбранная тема). Не для секретов (лежит открытым plist в контейнере) и не для больших данных (грузится в память целиком). Для App Group — `UserDefaults(suiteName:)`.",
d:["`register(defaults:)` задаёт значения по умолчанию в памяти (не пишет на диск) — вызывать на старте.","`bool(forKey:)` для отсутствующего ключа вернёт `false` — нельзя отличить «нет» от «false» без `object(forKey:)`.","`synchronize()` не нужен — устарел.","Кастомные типы — через `Codable` → `Data`; в SwiftUI — `@AppStorage`."],
ex:[{n:"",c:R`
let d = UserDefaults.standard
d.register(defaults: ["onboardingShown": false, "fontSize": 16])
print(d.integer(forKey: "fontSize"))          // 16

struct Settings: Codable { var theme = "dark" }
d.set(try? JSONEncoder().encode(Settings()), forKey: "settings")
let s = (d.data(forKey: "settings")).flatMap { try? JSONDecoder().decode(Settings.self, from: $0) }
print(s?.theme ?? "-")                        // dark

let shared = UserDefaults(suiteName: "group.com.example.app")   // для виджета/расширения`}]},
{t:"Файловая система",call:"Documents — данные пользователя (бэкап в iCloud). Application Support — служебные данные приложения (бэкап, можно исключить). Caches — то, что можно скачать заново (система может удалить при нехватке места). tmp — временное, удаляется системой.",
d:["Большие восстанавливаемые данные вне Caches — пометить `isExcludedFromBackup = true`.","Писать атомарно: `data.write(to:options: .atomic)`.","Data Protection: `.completeFileProtection` — файл недоступен при заблокированном устройстве (фоновые задачи не прочитают).","Пути контейнера меняются между запусками/обновлениями — хранить относительные пути, не абсолютные."],
ex:[{n:"",c:R`
let fm = FileManager.default
let support = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask,
                         appropriateFor: nil, create: true)
var dbURL = support.appendingPathComponent("feed.json")
try Data("[]".utf8).write(to: dbURL, options: [.atomic, .completeFileProtection])

var values = URLResourceValues()
values.isExcludedFromBackup = true
try dbURL.setResourceValues(values)

let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
let tmp = fm.temporaryDirectory`}]},
{t:"Кеширование: NSCache и URLCache",call:"`NSCache` — потокобезопасный in-memory кеш, сам вытесняет при нехватке памяти; лимиты `countLimit`/`totalCostLimit` — мягкие. `URLCache` — HTTP-кеш URLSession (память + диск) по заголовкам `Cache-Control`/`ETag`. Для картинок — NSCache (декодированные) + диск (сырые данные).",
d:["NSCache: ключи — объекты (`NSString`, `NSURL`), ключи не копирует (в отличие от NSDictionary); значения — классы (`UIImage`, обёртка для struct).","Cost для картинки ≈ `width × height × scale² × 4` байта.","ETag: сервер отдаёт `ETag`, клиент шлёт `If-None-Match`; если не изменилось — `304 Not Modified` без тела. С включённым URLCache URLSession сам подставит закешированный ответ, и вы увидите `200` с данными из кеша.","`cachePolicy`: `.useProtocolCachePolicy` (по умолчанию), `.reloadIgnoringLocalCacheData`, `.returnCacheDataElseLoad` (офлайн)."],
ex:[{n:"NSCache для картинок",c:R`
final class ImageMemoryCache {
    private let cache = NSCache<NSURL, UIImage>()
    init() {
        cache.countLimit = 200
        cache.totalCostLimit = 100 * 1024 * 1024   // ~100 МБ
    }
    func set(_ img: UIImage, for url: URL) {
        let cost = Int(img.size.width * img.scale * img.size.height * img.scale * 4)
        cache.setObject(img, forKey: url as NSURL, cost: cost)
    }
    func get(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
}`},
{n:"URLCache и ETag",c:R`
let config = URLSessionConfiguration.default
config.urlCache = URLCache(memoryCapacity: 20 << 20, diskCapacity: 200 << 20)
config.requestCachePolicy = .useProtocolCachePolicy
let session = URLSession(configuration: config)

// Ручной ETag (если кеш свой):
var req = URLRequest(url: URL(string: "https://api.example.com/feed")!)
req.setValue(savedETag, forHTTPHeaderField: "If-None-Match")
let (data, resp) = try await session.data(for: req)
switch (resp as? HTTPURLResponse)?.statusCode {
case 304: break                        // используем сохранённые данные
case 200: savedETag = (resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "ETag")
default: break
}`}]},
{t:"Сетевой слой на URLSession",call:"`URLSession.shared.data(for:)` (async) → проверить `HTTPURLResponse.statusCode` → декодировать `Codable`. Ошибки разделять: транспорт (`URLError`), HTTP-статус, декодирование. Отмена — через отмену Task.",
d:["`URLSession` не бросает ошибку на 404/500 — статус проверять самим.","`URLError.cancelled`/`CancellationError` не показывать пользователю как ошибку.","Повторы — только для идемпотентных запросов и сетевых ошибок, с экспоненциальной задержкой.","`waitsForConnectivity = true` в конфигурации — ждать сеть вместо мгновенной ошибки.","Фоновые загрузки — `URLSessionConfiguration.background(withIdentifier:)`, только delegate-API."],
ex:[{n:"",c:R`
enum APIError: Error { case http(Int), decoding(Error) }

struct API {
    let session: URLSession = .shared
    func get<T: Decodable>(_ url: URL, as: T.Type = T.self) async throws -> T {
        let (data, resp) = try await session.data(from: url)   // URLError, CancellationError
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(T.self, from: data)
        } catch { throw APIError.decoding(error) }
    }
}
struct User: Decodable { let id: Int; let firstName: String }   // first_name в JSON`}]},
{t:"Нормализация данных и базы",call:"Нормализация — хранить сущность один раз и ссылаться по id, чтобы обновление (лайк, имя автора) было видно везде. Хранилища: Core Data / SwiftData (граф объектов, миграции), SQLite/GRDB (контроль SQL), Realm. Для простого кеша — JSON-файл.",
d:["Денормализованные данные: один и тот же автор копируется в каждый пост → после правки рассинхрон.","Core Data: контекст не потокобезопасен — `perform {}` на его очереди; между потоками передавать `NSManagedObjectID`.","SwiftData (iOS 17): `@Model`, `ModelContext`, `@Query` в SwiftUI; контекст тоже привязан к актору.","Миграции схемы продумывать заранее (lightweight / versioned schema)."],
ex:[{n:"Нормализованный стор",c:R`
struct User: Identifiable { let id: Int; var name: String }
struct Post: Identifiable { let id: Int; let authorID: Int; var text: String }

struct Store {
    var users: [Int: User] = [:]
    var posts: [Int: Post] = [:]
    func author(of post: Post) -> User? { users[post.authorID] }
}
var store = Store()
store.users[1] = User(id: 1, name: "Roman")
store.posts[10] = Post(id: 10, authorID: 1, text: "hi")
store.posts[11] = Post(id: 11, authorID: 1, text: "hello")
store.users[1]?.name = "Роман"      // одна правка → видно во всех постах
print(store.author(of: store.posts[11]!)!.name)   // Роман`}]}
]});
