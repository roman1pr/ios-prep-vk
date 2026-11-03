put({id:"swiftui",t:"SwiftUI",topics:[
{t:"Identity и пересчёт body",call:"View — описание, struct; `body` пересчитывается при изменении зависимостей. Состояние (`@State`) привязано к identity view: структурной (позиция в иерархии) или явной (`id`, `ForEach` по `Identifiable`). Сменилась identity — состояние сбрасывается, анимации — как удаление/вставка.",
d:["`if/else` в body — две разные ветки = две разные identity; модификатор с условием (`opacity(flag ? 1 : 0)`) сохраняет identity.","`ForEach(items, id: \\.self)` с дубликатами или `id: \\.offset` — баги со состоянием строк при вставке/удалении.","`.id(value)` — принудительно пересоздать view (сбросить состояние/скролл).","Минимизировать пересчёт: выносить части в отдельные View, передавать только нужные данные; `Self._printChanges()` в body для отладки."],
ex:[{n:"Сохранение и потеря состояния",c:R`
struct Demo: View {
    @State private var on = false
    var body: some View {
        VStack {
            Toggle("on", isOn: $on)
            if on { Counter() } else { Counter() }   // разные identity → счётчик сбросится
            Counter().opacity(on ? 1 : 0.5)          // одна identity → счётчик сохранится
        }
    }
}
struct Counter: View {
    @State private var n = 0
    var body: some View { Button("\(n)") { n += 1 } }
}`}]},
{t:"Состояние: @State, @Binding, @Observable",call:"`@State` — локальное состояние, которым view владеет. `@Binding` — ссылка на чужое состояние. `@Observable` (iOS 17) — модель-класс, view подписывается только на реально прочитанные свойства. Владеет моделью `@State`, передаётся просто как `let`/`@Bindable`.",
d:["До iOS 17: `ObservableObject` + `@Published`; `@StateObject` — владеет (создаётся один раз), `@ObservedObject` — не владеет (пересоздастся с родителем — частый баг).","`@Observable` точечнее: изменение свойства, которое body не читает, не вызывает пересчёт.","`@Bindable var model` — чтобы получить `$model.text` для TextField.","`@Environment(Model.self)` — передача через окружение.","`@State` инициализируется один раз; передача значения в init дочернего `@State` не обновит его позже."],
ex:[{n:"@Observable + .task",c:R`
import Observation

@Observable @MainActor
final class FeedModel {
    var items: [String] = []
    var isLoading = false
    func load() async {
        isLoading = true
        defer { isLoading = false }
        try? await Task.sleep(for: .milliseconds(300))
        items = ["a", "b", "c"]
    }
}

struct FeedView: View {
    @State private var model = FeedModel()
    var body: some View {
        List(model.items, id: \.self) { Text($0) }
            .overlay { if model.isLoading { ProgressView() } }
            .task { await model.load() }    // отменится при исчезновении
    }
}`},
{n:"@Binding",c:R`
struct Parent: View {
    @State private var name = ""
    var body: some View { NameField(name: $name) }
}
struct NameField: View {
    @Binding var name: String
    var body: some View { TextField("Имя", text: $name) }
}`}]},
{t:".task vs onAppear",call:"`.task` запускает async-работу при появлении и автоматически отменяет при исчезновении; `.task(id:)` перезапускает при смене id. `onAppear` синхронный, может вызываться несколько раз, отмены нет.",
d:["Внутри `onAppear` с `Task {}` — задачу надо отменять вручную, иначе она переживёт view.","`onAppear` в `List`/`LazyVStack` вызывается при каждом появлении строки при скролле.","`.task(id: query)` — удобный поиск с debounce: при новом query старая задача отменяется."],
ex:[{n:"Поиск с debounce",c:R`
struct SearchView: View {
    @State private var query = ""
    @State private var results: [String] = []
    var body: some View {
        List(results, id: \.self) { Text($0) }
            .searchable(text: $query)
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(300))   // отменится при новом вводе
                guard !Task.isCancelled else { return }
                results = await search(query)
            }
    }
    func search(_ q: String) async -> [String] { q.isEmpty ? [] : [q, q + q] }
}`}]},
{t:"List vs LazyVStack",call:"`List` — на базе UICollectionView: переиспользование ячеек, swipe actions, разделители, выделение. `LazyVStack` в `ScrollView` — создаёт view лениво, но не переиспользует; созданные view остаются в памяти. Для больших списков — List или стабильные id.",
d:["Стабильные id (`Identifiable` с id из модели) — ключ к корректным анимациям и производительности.","`VStack` (не lazy) в ScrollView создаёт все строки сразу.","Программный скролл — `ScrollViewReader` / `scrollPosition(id:)` (iOS 17).","Тяжёлые строки: `equatable()`-подобная оптимизация — разбить на мелкие View с простыми входами."],
ex:[{n:"",c:R`
struct Item: Identifiable { let id: UUID; var title: String }

ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(items) { item in       // id из модели — стабильный
            Row(item: item)
        }
    }
}`}]},
{t:"Клавиатура и фокус",call:"`@FocusState` управляет фокусом полей; сброс фокуса = скрыть клавиатуру. `.scrollDismissesKeyboard(.interactively)` — скрытие при скролле (iOS 16). Кнопка «Готово» — через `.toolbar { ToolbarItemGroup(placement: .keyboard) }`.",
d:["`@FocusState private var focused: Field?` с enum — переход между полями по `.onSubmit`.","`.submitLabel(.next)` меняет кнопку Return.","Подъём контента под клавиатуру SwiftUI делает сам (safe area); отключить — `.ignoresSafeArea(.keyboard)`."],
ex:[{n:"",c:R`
struct LoginView: View {
    enum Field { case email, password }
    @State private var email = "", password = ""
    @FocusState private var focus: Field?

    var body: some View {
        Form {
            TextField("Email", text: $email)
                .focused($focus, equals: .email)
                .submitLabel(.next)
                .onSubmit { focus = .password }
            SecureField("Пароль", text: $password)
                .focused($focus, equals: .password)
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Готово") { focus = nil }
            }
        }
    }
}`}]},
{t:"UIKit ↔ SwiftUI",call:"SwiftUI в UIKit — `UIHostingController(rootView:)` (как child VC). UIKit в SwiftUI — `UIViewRepresentable`/`UIViewControllerRepresentable`: `makeUIView` один раз, `updateUIView` при изменениях, события обратно — через `Coordinator`.",
d:["В `updateUIView` не пересоздавать view, только обновлять свойства, и проверять, изменилось ли значение (иначе циклы обновлений).","Coordinator — делегат UIKit-компонента, держит `Binding` / родительскую структуру.","`sizingOptions = .intrinsicContentSize` у UIHostingController (iOS 16) для автоматического размера."],
ex:[{n:"",c:R`
struct SearchBar: UIViewRepresentable {
    @Binding var text: String

    func makeUIView(context: Context) -> UISearchBar {
        let bar = UISearchBar()
        bar.delegate = context.coordinator
        return bar
    }
    func updateUIView(_ bar: UISearchBar, context: Context) {
        if bar.text != text { bar.text = text }
    }
    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, UISearchBarDelegate {
        var text: Binding<String>
        init(text: Binding<String>) { self.text = text }
        func searchBar(_ bar: UISearchBar, textDidChange t: String) { text.wrappedValue = t }
    }
}`}]}
]});
