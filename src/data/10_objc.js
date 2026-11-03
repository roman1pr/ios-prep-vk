put({id:"objc",t:"Objective-C",topics:[
{t:"Класс: .h, .m, init",call:"`.h` — публичный `@interface`, `.m` — `@implementation` и приватный class extension `@interface Feed ()`. `-` — метод экземпляра, `+` — метод класса. Все объекты — по указателю (`NSString *`). `init` может вернуть nil, поэтому `self = [super init]; if (self) {...}`.",
d:["В `init`/`dealloc` обращаться к ivar (`_title`), а не через `self.title` — сеттер может быть переопределён в подклассе.","`instancetype` — «тип текущего класса» (как `Self`).","`@property` синтезирует ivar `_name`, геттер `name` и сеттер `setName:`.","Имя метода (селектор) складывается из частей: `initWithTitle:`, `addItem:atIndex:`."],
ex:[{n:"",c:R`
// Feed.h
@interface Feed : NSObject
@property (nonatomic, copy) NSString *title;
- (instancetype)initWithTitle:(NSString *)title;
+ (instancetype)feedWithTitle:(NSString *)title;
@end

// Feed.m
@interface Feed ()                       // приватное
@property (nonatomic, strong) NSMutableArray<NSString *> *items;
@end

@implementation Feed
- (instancetype)initWithTitle:(NSString *)title {
    self = [super init];
    if (self) {
        _title = [title copy];
        _items = [NSMutableArray array];
    }
    return self;
}
+ (instancetype)feedWithTitle:(NSString *)title {
    return [[self alloc] initWithTitle:title];
}
@end

// Swift: Feed(title: "News"), Feed.feedWithTitle → тоже Feed(title:)`}]},
{t:"Сообщения и nil",call:"`[obj method]` компилируется в `objc_msgSend(obj, @selector(method))` — метод ищется в рантайме. Сообщение `nil` не падает и возвращает 0/nil/NO. Но выход за границы `NSArray` или вставка `nil` в коллекцию — краш.",
d:["`[nil count]` → 0; `[nil objectAtIndex:0]` → nil.","`@[obj]` или `[array addObject:obj]`, где obj == nil → исключение; `mDict[@\"k\"] = nil` у `NSMutableDictionary` — не краш, удаляет ключ.","`id` — любой объект, компилятор не проверяет методы.","Struct-возврат от nil-сообщения (CGRect) — нули на современных рантаймах, но полагаться не стоит."],
ex:[{n:"",c:R`
NSArray *items = nil;
NSLog(@"%lu", (unsigned long)items.count);   // 0, без краша

NSArray *a = @[@1, @2];
// [a objectAtIndex:5];                        // 💥 NSRangeException

NSMutableArray *m = [NSMutableArray array];
// [m addObject:nil];                          // 💥 NSInvalidArgumentException

NSString *s = nil;
if ([s isEqualToString:@"x"]) {}              // NO — тихо ложь, частая логическая ошибка`}]},
{t:"Атрибуты свойств",call:"`strong` (держит), `weak` (не держит, обнуляется), `assign` (для примитивов; у объекта — висячий указатель), `copy` (копия при присвоении — для NSString, блоков, коллекций), `atomic` (по умолчанию) / `nonatomic`, `readonly` / `readwrite`.",
d:["`copy` у NSString: снаружи могут передать `NSMutableString` и изменить его после присвоения.","`atomic` гарантирует целостность одного геттера/сеттера, но не потокобезопасность логики (`if (self.x) self.x = …` — гонка).","Наружу `readonly`, внутри class extension переобъявить `readwrite` ≈ `private(set)`.","Делегат — всегда `weak`; блок-свойство — `copy`."],
ex:[{n:"Зачем copy",c:R`
@property (nonatomic, strong) NSString *strongName;
@property (nonatomic, copy)   NSString *copyName;

NSMutableString *m = [NSMutableString stringWithString:@"Roman"];
obj.strongName = m;
obj.copyName = m;
[m appendString:@"!"];
NSLog(@"%@ %@", obj.strongName, obj.copyName);   // Roman! Roman`}]},
{t:"Блоки, __weak и __block",call:"Блок захватывает значения переменных на момент создания (как `[x]`), объекты — сильно. Для изменения переменной внутри блока — `__block`. Против цикла — `__weak typeof(self) weakSelf = self;` и внутри `__strong` копия (weak-strong dance).",
d:["Блок, сохранённый в свойство, надо копировать (`copy`) — исторически блоки создаются на стеке.","`__strong typeof(weakSelf) strongSelf = weakSelf; if (!strongSelf) return;` — аналог `guard let self`.","Обращение к ivar `_items` внутри блока неявно захватывает `self` → тоже цикл.","Ошибки — через `NSError **` или параметр `NSError *` в блоке, не исключения."],
ex:[{n:"Захват значения vs __block",c:R`
int x = 1;
__block int y = 1;
void (^blk)(void) = ^{ NSLog(@"%d %d", x, y); };
x = 2; y = 2;
blk();   // 1 2`},
{n:"weak-strong dance",c:R`
__weak typeof(self) weakSelf = self;
[self.api loadWithCompletion:^(NSArray *items, NSError *error) {
    __strong typeof(weakSelf) self_ = weakSelf;
    if (!self_) return;
    [self_ showItems:items];
}];`}]},
{t:"Протоколы и делегаты",call:"`@protocol` с `@required` (по умолчанию) и `@optional` методами. Перед вызовом optional-метода — `respondsToSelector:`, иначе краш `unrecognized selector`. Делегат хранится `weak`.",
d:["`<NSObject>` в объявлении протокола даёт `respondsToSelector:` и прочие базовые методы.","В Swift optional-методы есть только у `@objc protocol` и вызываются `delegate?.method?()`.","Таблица на Obj-C — те же `dataSource`-методы, длинные селекторы `tableView:cellForRowAtIndexPath:`."],
ex:[{n:"",c:R`
@protocol FeedViewDelegate <NSObject>
- (void)feedView:(FeedView *)view didSelectItemAtIndex:(NSInteger)index;
@optional
- (void)feedViewDidScroll:(FeedView *)view;
@end

@property (nonatomic, weak) id<FeedViewDelegate> delegate;

if ([self.delegate respondsToSelector:@selector(feedViewDidScroll:)]) {
    [self.delegate feedViewDidScroll:self];
}`}]},
{t:"Мост со Swift",call:"Obj-C → Swift через bridging header; Swift → Obj-C через сгенерированный `Module-Swift.h`, видны `@objc`-члены (классы — наследники NSObject). Nullability: `nullable` → `T?`, `nonnull` → `T`, без пометки → `T!`.",
d:["`NS_ASSUME_NONNULL_BEGIN/END` — всё nonnull по умолчанию.","Легковесные дженерики `NSArray<NSString *> *` → `[String]`, без них → `[Any]`.","`NS_SWIFT_NAME(...)` — красивое имя в Swift; `NS_REFINED_FOR_SWIFT` — спрятать и обернуть.","Swift struct, enum с associated values, generics не видны в Obj-C."],
ex:[{n:"",c:R`
NS_ASSUME_NONNULL_BEGIN
@interface UserService : NSObject
- (nullable User *)userWithID:(NSInteger)userID;
- (void)loadUsers:(void (^)(NSArray<User *> *users, NSError * _Nullable error))completion;
@end
NS_ASSUME_NONNULL_END

// В Swift:
// func user(withID userID: Int) -> User?
// func loadUsers(_ completion: @escaping ([User], Error?) -> Void)
// + автоматически async-версия: func loadUsers() async throws -> [User]`}]},
{t:"Runtime: forwarding, swizzling, associated objects",call:"Метод не найден → `resolveInstanceMethod:` (добавить реализацию) → `forwardingTargetForSelector:` (переадресовать другому объекту) → `methodSignatureForSelector:` + `forwardInvocation:` → `doesNotRecognizeSelector:` (краш). Swizzling — обмен реализаций через `method_exchangeImplementations`, обычно в `+load` с `dispatch_once`.",
d:["Категории добавляют методы к существующим классам (≈ extension), но не хранимые свойства — для них associated objects (`objc_setAssociatedObject`).","Категория с тем же именем метода тихо перекрывает оригинал — коллизии.","KVO работает через isa-swizzling: создаётся подкласс `NSKVONotifying_X` с переопределёнными сеттерами. В Swift нужен `@objc dynamic`.","Swizzling глобален и хрупок; применяют для аналитики, отладки."],
ex:[{n:"Swizzling viewWillAppear",c:R`
@implementation UIViewController (Tracking)
+ (void)load {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Method orig = class_getInstanceMethod(self, @selector(viewWillAppear:));
        Method mine = class_getInstanceMethod(self, @selector(trk_viewWillAppear:));
        method_exchangeImplementations(orig, mine);
    });
}
- (void)trk_viewWillAppear:(BOOL)animated {
    [self trk_viewWillAppear:animated];   // после обмена это вызов оригинала
    NSLog(@"show %@", NSStringFromClass([self class]));
}
@end`},
{n:"Forwarding",c:R`
- (id)forwardingTargetForSelector:(SEL)sel {
    if ([self.backup respondsToSelector:sel]) return self.backup;
    return [super forwardingTargetForSelector:sel];
}`}]}
]});
