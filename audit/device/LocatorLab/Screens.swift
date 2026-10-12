import SwiftUI

// Each screen is built for the cases in ../cases.json that name it. Values come from the
// corpus (anonymised pseudo-words) or the spec matrix, so most locators run unchanged.

enum Screens {
    @ViewBuilder
    static func view(for name: String) -> some View {
        switch name {
        case "smoke": SmokeScreen()
        case "probe": ProbeScreen()
        case "probe2": Probe2Screen()
        case "identity": ScrollView { LabScreen(nodes: identity) }
        case "functions": ScrollView { LabScreen(nodes: functions) }
        case "siblings": ScrollView { LabScreen(nodes: siblings) }
        case "lists": ScrollView { LabScreen(nodes: lists) }
        case "states": StatesScreen()
        case "nesting": NestingScreen()
        case "modal": ModalScreen()
        case "c1": C1Screen()
        case "scale": ScaleScreen(load: max(100, UserDefaults.standard.integer(forKey: "load")))
        case "scale-deep": ScaleDeepScreen()
        default: Text("unknown screen: \(name)").accessibilityIdentifier("unknownScreen")
        }
    }

    // 1. identity: identifier vs label, value vs label, special characters
    static let identity: [N] = [
        deep([.text("a)b"), .text("Romor wepes je robo\n7393")]),
        .text("Bika Fabis tuve so liv je mefizo mi tazeviz"),
        .text("Picama rajer t bevad motezef rari 0."),
        .text("Dozur, ti hibimaw rorefek fojo dosu"),
        .text("19, Juzo Kabih\nJomojab, FI16 7TE"),
        .text("Romor wepes je robo\n7393"),
        .text("Ves zov sori gisu fo wigobur zov tosu ce pumed tuvila now"),
        .text("Saved"),
        .row([.button("Bowep ge mipunaco"), .text("Bowep ge mipunaco info")]),
        .row([.text("Busu camenup kon zov cog rufosi je farowos votu bika tazeviz: 3"), .button("Busu camenup kon zov cog rufosi je farowos votu bika tazeviz: edit")]),
        .row([.text("Lugatej pejun huregad"), .text("Lugatej pejun huregad")]),
        .text("Pi cog rufosi je sadobu dom laciwuj zov cuba wumesok. Picama camavi zov cog sehoj bika koce dovo goz sibo ho munub va pi wikop jigiraz rekivame pelu velotop."),
        .text("Rajer bika sibo ho munub va DE / LO / KIMO."),
        .text("Zov hat wikop bika pelu colusegoma gatejese tevej goz maceti bika pubiwehipet fo wedocagi dom bilakide ri hu rig."),
        .text("Dom colusegoma goz kijical hu dewusines pelu fajoni ce je tonodo goz pobupat gecupiribem dulacoci fuhemoka je zov ri dom Hijareci Logozeb sufaket goz Keb, goz ri fufug fugowome. Heti cog dere nuna je wasaj dom kic zov kizik ri, hu je wasaj dom genilut zov foba zenu zov kizik ri su lu."),
        .row([.button("Giji Navecuhu laciwuj"), .text("Giji Navecuhu laciwuj")]),
        .row([.text("Cog zov husu zov noca je diteda?"), .button("Cog zov husu zov noca je diteda? Help")]),
        .row([.text("Jeb fej rolafa"), .text("Jeb fej")]),
        .text("Kup bapoh wigobur."),
        .row([.text("Dikasod vilokor: £3.20"), .text("Dikasod ditar: £4.20", id: "DacinIjaVudaKecemoRisu.jibikIhofe"), .text("Dikasod ditar: £4.20")]),
        .text("rolafa desuz figuleni"),
        .text("Ticket", value: "Pako goz tival 3 lines je poz £2.50"),
        .text("Monday"),
        .text("Ganam Zemori Jila"),
        .text("Kup sefasi. Vik fecegiv je poz."),
        .text("Zov cuba nififet dom kofodat rolafa ho wajih."),
        .text("Kajepazagopotev, zov cuba jizorawohuni posetog bika tazeviz"),
        .row([.text("Hello Alex"), .button("Alex")]),
        .text("Kuz je vap bika zucubamo?"),
        .text("Leba Mipunaco?"),
        .row([.text("Meli bika tazeviz 1"), .text("Jeb fabis tuve 2"), .button("Meli bika tazeviz")]),
        .row([.button("Veg monuw"), .button("Codid", id: "LipohUgicolu.codid"), .text("Veg monuw")]),
        .text("Cog zov husu zov noca je hicepe hom dulacoci?"),
        .text("Rigi gohaz gusuri"),
        .row([.text("NE Cisibosogoz Jufoz bihi"), .text("NE Cisibosogoz Jufoz bihi Bika")]),
        .row([.text("Cijahil: £5"), .text("Dew deguw: £5"), .button("Cijahil: £5")]),
        .text("Tu hibimaw pamul"),
        .row([.text("Bika kavemag"), .text("Bika rorefek")]),
        .text("Rurez mazejuz: 4"),
        .row([.image("star", id: "kasoc_jijun"), .image("star", id: "kasoc_other")]),
        .row([.button("Jeb wajih je dobe ticu"), .button("Wikop wajih teg kavemag"), .text("Jeb wajih je dobe ticu")]),
        .row([.text("Tazeviz"), .button("Gihasem"), .text("Bika pejun huregad")]),
        // literals and escaping (spec G)
        .row([.text("it's"), .text("say \"hi\""), .text("a\"b"), .text("a`b")]),
        .text("a\nb"),
        .text("Zov’gi £5 • x"),
        .row([.text("star", id: "a*b"), .text("decoy", id: "aXYZb"), .text("q", id: "a?"), .text("decoy", id: "aZ"), .text("sq", id: "a*?"), .text("decoy", id: "aQQ")]),
        .row([.text("a/b|c(d)"), .text("a)b"), .text("a)b"), .text("C:\\dir"), .text("$5 and @x"), .text("$5 and x"), .text("a]b")]),
        .web(id: "localPage"),
    ]

    // functions: XPath 1.0 string functions, WDA extension functions, attribute basics (spec A03/A04, B, C, H)
    static let functions: [N] = [
        .row([.text("abc"), .text("xabcx"), .text("ab"), .text("xab"), .text("ABc"), .text("zzz")]),
        .row([.text("AB"), .text("xABx"), .text("ba"), .text("a b"), .text(" a  b "), .text("a  b")]),
        .row([.button("ab"), .button("abcd"), .button("Save", id: "a"), .button("a"), .text("true"), .text("false")]),
        .row([.text("first", id: "a"), .box(id: "a", label: "a box", [.text("inner")])]),
    ]

    // 2. siblings: key/value rows, labels followed by controls, parent/ancestor targets
    static let siblings: [N] = [
        .box(id: "summary", [.text("Summary"), .text("Cost:", id: "a"), .text("£12.50"), .button("Edit", id: "editCost")]),
        .box(id: "summary2", [.text("Before"), .text("Cost:"), .text("£9.99")]),
        .box([.text("Bedoce hom"), .text("£5"), .text("x hilubodamo")]),
        .row([.text("Key", id: "LovemifajEgetifoJewe.kesoZugop"), .box(id: "kesoValue", [.text("Kup"), .text("Kap")])]),
        .box([.text("Disohinid mipunaco"), .button("Info"), .text("Mipunaco value"), .text("Other value")]),
        .box([.text("Head", id: "LunaseMinihEsak.vosuzAnomeMevoja"), .text("Second"), .text("Third"), .textView("Fourth")]),
        .box([.text("Kabih"), .text("Mid"), .text("Zov’gi mi dom pefu")]),
        .box(id: "gohazPanel", [.button("Hom gohaz figuleni"), .scroll(id: "gohazScroll", height: 30, [.text("Scrolled 1")])]),
        .box([.text("Prefix A"), .button("Dobe teg 1"), .text("After teg")]),
        .box([.text("Before monuw"), .button("Dobe monuw 1")]),
        .text("Kodid", id: "HetepUriZoviZoniHapa.codid"),
        .box(id: "bumajepUgapeb(\"7\")Hilubodamo", [.text("Bumajep child 1"), .text("Bumajep child 2")]),
        .row([.text("Lotto"), .text("Mid lotto"), .text("Draw 1"), .text("Draw 2")]),
        .table(id: "sibTable", [
            .cell(id: "sib.1", [.text("Item 1"), .button("Remove", id: "sib.remove")]),
            .cell(id: "sib.2", [.text("Item 2"), .box(id: "sib.inner", [.button("Remove", id: "sib.remove")])]),
            .cell(id: "sib.3", [.text("Item 3")]),
        ]),
    ]

    // 3. lists: 3 sections × 4 rows with identical labels across sections, so per-parent
    //    positions differ from global ones; grouped (…)[n], last(), outer index on parent
    static func section(_ name: String) -> N {
        .table(id: name, (1...4).map { i in
            K.cell(id: "row.\(i)", i == 3 ? [.text("Line \(i)"), .button("Taka", id: "row.edit")]
                                          : [.text("Line \(i)"), .button("Taka", id: "row.edit"), .button("Delete", id: "row.delete")])
        })
    }
    // Matches nested deeper than their twins but earlier in the document (SwiftUI collapses the nested
    // boxes into one level, which is still one level deeper than the rows; the Taka button sits in a
    // table cell to be deeper than the section buttons): XPath positions count them
    // first, XCTest (breadth-first) last, so grouped `(//X)[n]` and `**/X[n]` pick different elements (RC-D1).
    static func deep(_ kids: [N]) -> N { .box(id: "deep.1", [.box(id: "deep.2", [.box(id: "deep.3", kids)])]) }
    static let lists: [N] = [
        deep([
            .text("Line 1"), .text("j0", id: "jila_zugo"), .text("Kuki pefu matumutor"),
            .box(label: "Lenapa gusuri 0", [.text("Lenapa z")]), .text("12 Oct deep"), .box(id: "Luvuce tuve nowam", [.text("L0")]),
            .button("Dobe teg 0"), .box(label: "Dobe teg deep", [.text("Dobe deep")]),
            .text("Woj, ge sefasi zad t jivuho bihi, Nepureze, hilubodamo"), .box(id: "hilubodamo, lulik gusuri", [.text("H0")]),
            .table(id: "deepTable", [.cell(id: "deep.cell", [.text("deep cell"), .button("Taka", id: "row.edit")])]),
        ]),
        section("Section A"), section("Section B"), section("Section C"),
        .table(id: "payTable", [
            .cell(id: "pay.1", [.box(id: "payBox", [.button("Pay", id: "row.pay")])]),
            .cell(id: "row.pay", [.text("Paid")]),
            .cell(id: "pay.3", [.text("Nothing")]),
        ]),
        .table(id: "overdueTable", [
            .cell(id: "due.1", [.text("Overdue"), .button("Pay now", id: "due.pay")]),
            .cell(id: "due.2", label: "Overdue", [.button("Pay later", id: "due.later")]),
        ]),
        .box(id: "Vilokor, 1", [.text("v1a"), .text("v1b")]),
        .box(id: "Vilokor, 2", [.text("v2a")]),
        .box(id: "Vilokor, 3", [.text("v3a"), .text("v3b")]),
        .box(id: "VavepaGomudatepUvepajImar.lawupe(0)", [.text("lawupe a1"), .text("lawupe a2")]),
        .box(id: "VavepaGomudatepUvepajImar.lawupe(0)", [.text("lawupe b1"), .text("lawupe b2")]),
        .combined(id: "receipt.1", [.text("Total"), .image("star", id: "receipt.icon")]),
        .combined(id: "receipt.2", [.text("Code 1"), .text("Code 2")]),
        .row([.text("12 Oct ticket"), .text("12 Oct draw"), .text("12 Oct result")]),
        .box(id: "Code 2, total: £5", [.text("Code 2 detail")]),
        .row([.box(id: "Luvuce tuve nowam", [.text("L1")]), .box(id: "Luvuce tuve nowam", [.text("L2")]), .box(id: "Luvuce tuve nowam", [.text("L3")])]),
        .row([.button("Pako geviv: 1"), .button("Pako geviv: 12"), .text("Pako geviv: 1")]),
        .text("Bika sefasi zad 3 lines"),
        .row([.button("Dobe teg 1"), .box([.button("Dobe teg 2")]), .button("Dobe teg Lotto")]),
        .box(label: "Dobe teg list", [.box(label: "Dobe teg row", [.text("Dobe inner")])]),
        .row([.text("j1", id: "jila_zugo"), .text("j2", id: "jila_zugo"), .text("j3", id: "jila_zugo")]),
        .row([.text("Kuki pefu matumutor"), .text("Kuki pefu matumutor")]),
        .box(label: "Lenapa gusuri 1", [.text("Lenapa a"), .text("Lenapa b")]),
        .box(label: "Lenapa gusuri 2", [.text("Lenapa c")]),
        .row([.text("Woj, ge sefasi zad t jivuho bihi, Nepureze, hilubodamo"), .text("Woj, ge sefasi zad t jivuho bihi, Nepureze, hilubodamo")]),
        .text("Hero bihi 7"),
        .row([.text("Fej bihi tete 7, jeb t fej bihi"), .box(id: "Bihi 7", [.text("Bihi 7")])]),
        .row([.text("3 winners"), .text("Nodeg: 3"), .text("1 winner")]),
        .row([.box(id: "hilubodamo, lulik gusuri", [.text("H1")]), .box(id: "hilubodamo, lulik gusuri", [.text("H2")]), .box(id: "hilubodamo, lulik gusuri", [.text("H3")])]),
        ticket(1, picks: 4, last: "Wacisugik mazejuz"),
        ticket(2, picks: 3, last: "mazejuz"),
        ticket(12, picks: 4, last: "Wacisugik mazejuz"),
    ]
    // a ticket row: container whose label carries all its facts, with nested detail
    static func ticket(_ line: Int, picks: Int, last: String) -> N {
        .box(id: "PofuJiwirupIpuj.tete(\(line))", label: "Tete \(line), pako geviv \(picks), Petor 2, Bevef daw notupisa, Bevef Daw, \(last)", [
            .box(label: "Tete \(line) numbers", [.text("Kurez \(picks)")]),
            .text("Prize £5"),
        ])
    }
}

// c1 (Phase 5, C1): values on which an XPath and the class chain a model or the converter writes for it
// can disagree. Its own screen, so the Phase 2 screens keep their layout.
struct C1Screen: View {
    static let nodes: [N] = [
        // H02/H03: newline in the identifier (ICU `$` also matches before a final \n; `.` does not cross \n)
        .row([.text("abc-nl", id: "abc\n"), .text("x-nl-b", id: "x\nb"), .text("a-nl-c", id: "a\nc"), .text("abc"), .text("ABc"), .text("zzz")]),
        // C06: no-break space and tab between a and b; normalize-space strips only space, tab, CR, LF
        .row([.text("a\u{00A0}b"), .text("a\tb"), .text("a b"), .text(" a  b ")]),
        // C08/H05/H06: case
        .row([.text("ab"), .text("AB"), .text("Ab"), .text("xABx")]),
        // C07: 2 code points, 4 UTF-16 units
        .row([.button("😀😀"), .button("abcd"), .button("abc")]),
        // B03: values XPath number() reads as NaN, NSString doubleValue as 10 and 1000
        .row([.button("Qty", value: "10abc"), .button("Qty", value: "1e3"), .button("Qty", value: "7"), .button("Qty", value: "3")]),
        // D0 (Phase 5): characters NSPredicate may fold. Fullwidth Q/q, ligature fi, circled 1, long s, sharp s, Kelvin sign,
        // then decomposed (base + combining mark) and composed e-acute and A-ring, then the ASCII twins
        .row([.text("\u{FF31}"), .text("\u{FF51}"), .text("\u{FB01}"), .text("\u{2460}"), .text("\u{017F}"), .text("\u{00DF}"), .text("\u{212A}")]),
        .row([.text("e\u{0301}"), .text("\u{00E9}"), .text("A\u{030A}"), .text("\u{00C5}")]),
        .row([.text("Q"), .text("q"), .text("fi"), .text("1"), .text("s"), .text("ss"), .text("SS"), .text("K"), .text("k"), .text("e"), .text("A")]),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            LabScreen(nodes: Self.nodes)
            // B04: buttons at a fractional x (the 8 pt screen padding + spacer): the page source writes x
            // as an integer, rect.x keeps the fraction
            ForEach([52.2, 52.7], id: \.self) { w in
                HStack(spacing: 0) {
                    Color.clear.frame(width: w, height: 1)
                    Button("Frac") {}.font(.caption2).accessibilityIdentifier("frac.\(Int(w * 10))")
                    Spacer(minLength: 0)
                }.padding(.horizontal, 8)
            }
            // SwiftUI puts both at x = 60 (its accessibility frames are whole points); a UIKit frame keeps x = 60.5
            FracKit().frame(height: 16).padding(.horizontal, 8)
            Spacer(minLength: 0)
        }
    }
}
struct FracKit: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let v = UIView(), b = UIButton(type: .system)
        b.setTitle("Frac", for: .normal); b.titleLabel?.font = .systemFont(ofSize: 11); b.accessibilityIdentifier = "frac.kit"
        b.frame = CGRect(x: 52.5, y: 0, width: 30.5, height: 16)
        v.addSubview(b)
        return v
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

// 4. states: enabled/disabled twins, checkbox rows, fields, off-screen content, covered cells
struct StatesScreen: View {
    static let nodes: [N] = [
        .row([.button("Lugatej now"), .button("Lugatej now", enabled: false), .button("Leba"), .button("Leba", enabled: false), .button("Nozod hom"), .button("Nozod hom", enabled: false)]),
        .row([.button("Marivo", id: "HaguhoCuzal.marivoDigivo", enabled: false), .button("Marivo", id: "HaguhoCuzal.marivoDigivo"), .button("Teg 1", id: "Dobe monuw teg 1", enabled: false), .button("Teg 2", id: "Dobe monuw teg 2")]),
        .row([.button("Funela", id: "FetuwozaNihelavAvuv.funelaFecotu", enabled: false), .button("Funela", id: "FetuwozaNihelavAvuv.funelaFecotu"), .button("Kuki mipunaco 2", id: "FetuwozaNihelavAvuv.mipunaco")]),
        .row([.button("Play", value: "Lotto draw", enabled: false), .button("Play", value: "Lotto draw"), .text("Lotto results")]),
        .row([.button("Fufiku", id: "LofInipaSazAzuwiJuzovUsah.fufikuJugehOvuca", enabled: false), .button("Fufiku", id: "LofInipaSazAzuwiJuzovUsah.fufikuJugehOvuca"), .button("Tejazu", id: "LofInipaSazAzuwiJuzovUsah.tejazuLimicUbiro", enabled: false)]),
        .row([.button("Qty", value: "3"), .button("Qty", value: "7"), .button("Qty", value: "12"), .button("Size", value: "M"), .button("Plain")]),
        .row([.button("Terms, Checkbox, selected", selected: true), .button("Newsletter, Checkbox, unselected"), .toggle("Remember me", id: "remember", on: true)]),
        .box(id: "emailForm", [.field(placeholder: "Email", id: "email")]),
        .box(id: "nameForm", [.field(placeholder: "First name"), .field(placeholder: "Last name")]),
        .row([.secure(placeholder: "Password", id: "password"), .textView("Rofozopevol dobe goz jotobap kop werunez befa so kop vuvodegu ok", id: "notes")]),
        .scroll(id: "offscreen", height: 40, (1...6).map { .button("Hidden \($0)") }),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            LabScreen(nodes: Self.nodes)
            // Cells whose centre is covered by another element: WDA reports such a container as
            // not visible while the uncovered button inside it is visible (optimizer rule 7, A16).
            NodeView(.table(id: "coveredTable", [
                .cell(id: "covered.1", [.button("Open", id: "covered.open")]),
                .cell(id: "covered.2", [.button("Open", id: "covered.open")]),
            ]))
            .overlay(alignment: .trailing) { Text("Cover").frame(width: 260, height: 88).background(Color.yellow).accessibilityIdentifier("cover") }
            NodeView(.table(id: "plainTable", [.cell(id: "plain.1", [.button("Open", id: "plain.open")])]))
            // A cell clipped by its scroll view: 3 pt of clip.2 is on screen, its button is not, so the
            // Cell is visible and its Button is not (optimizer rule 7 moves `visible` from Cell to Button)
            NodeView(.scroll(id: "clipScroll", height: 47, [.table(id: "clipTable", [
                .cell(id: "clip.1", [.button("Open", id: "clip.open")]),
                .cell(id: "clip.2", [.button("Open", id: "clip.open")]),
            ])]))
            Spacer(minLength: 0)
        }
    }
}

// 5. nesting: identifier-less wrappers, same names at different depths, a sticky bottom bar,
//    precedence targets, and UIKit views placed straight in the window (Window/Button, Window/Other/Button)
struct NestingScreen: View {
    static let nodes: [N] = [
        .button("Save", id: "btnSave"),
        .box(id: "Bariduco box", [.text("Riduco title", id: "WefaniBedufeDanu.gotePebazoh"), .text("Riduco sub")]),
        .box(id: "riduco other", [.box([.text("Deep title", id: "WefaniBedufeDanu.gotePebazoh")])]),
        // precedence targets (spec D, corpus L019): the two readings of `a and b or c` differ
        .row([.button("Gift card", id: "promo", value: "applied"), .button("Gift card", id: "voucher", value: "pending"),
              .button("Coupon", id: "promo", value: "pending"), .button("Coupon", id: "voucher", value: "applied"), .button("Gift voucher", id: "giftv")]),
        .row([.text("Gift note"), .text("voucher text", id: "voucher")]),
        .row([.button("Pefu laciwuj 2", id: "WefaniBedufeDanu.jubuferokIzinaw"), .button("Jif sefasi", id: "WefaniBedufeDanu.zuzavilEgawiv"), .button("Jif", id: "WefaniBedufeDanu.zuzavilEgawiv")]),
        .box(label: "Galufaz Poz Gohaz matumutor", [.text("Kup 1"), .text("Kup 2"), .button("Kup")]),
        .box(label: "Pejun, Lenapa gusuri, RI", [.text("Pejun")]),
        .buttonBox(id: "GocibozuPenalIgug.voceseruBiful", label: "Voceseru", [.button("Inner"), .text("Inner text")]),
        .box(label: "Bevef Daw summary", [.text("Bevef")]),
        .box(label: "Nepureze outer", [.box(label: "Nepureze inner", [.text("Nepureze leaf")]), .text("Nepureze side")]),
        .box(label: "Nepureze 2", [.text("Nepureze 2a")]),
        .box(label: "Lulik gusuri teg 4 jidur figuleni", [.text("Lulik")]),
        .box(id: "Monday, Nepureze, figuleni", [.text("Monday box")]),
        .box(id: "WimazatOzuv.kumogigafOsen.panel", [.text("Kumogi")]),
        .box(label: "TI panel", [.text("Ti")]),
        .box([.box([.box([.button("Wrapped", id: "wrapped")])])]),
        .box(id: "level1", [.text("Name", id: "same"), .box(id: "level2", [.text("Name", id: "same"), .box(id: "level3", [.button("Name", id: "same")])])]),
    ]
    static let window: [K] = [
        .button("Close"),
        .box(id: "overlayBox", [.button("Close"), .button("Open")]),
    ]
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView { LabScreen(nodes: Self.nodes, window: Self.window) }
                // sticky bottom bar: primary and secondary share an identifier, labels differ
                HStack {
                    Button("Doso mi") {}.accessibilityIdentifier("WefaniBedufeDanu.gotePebazoh")
                    Button("Kabih") {}.disabled(true).accessibilityIdentifier("WefaniBedufeDanu.gotePebazoh")
                    Button("Dijiv") {}.accessibilityIdentifier("HetepUriZoviZoniHapa.dijivOdozev")
                }
                .font(.caption2).padding(6).frame(maxWidth: .infinity).background(Color.gray.opacity(0.2))
            }
            .navigationTitle("Nesting").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Close") {} }
        }
    }
}

// 6. modal: navigation bar with back and close, a sheet with a close button, an alert on top
struct ModalScreen: View {
    @State private var path = ["detail"]
    @State private var sheet = true
    var body: some View {
        NavigationStack(path: $path) {
            Text("Root").navigationTitle("Root")
                .navigationDestination(for: String.self) { _ in
                    VStack {
                        Button("Namatir wepes je dobe") {}
                        Button("Raf ra") {}
                        Text("Detail body")
                    }
                    .navigationTitle("Detail")
                    .toolbar { Button("Close") {} }
                }
        }
        .sheet(isPresented: $sheet) { SheetView() }
    }
}
struct SheetView: View {
    @State private var alert = false
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading) {
                Button("Namatir wepes je dobe") {}
                Button("Honey", action: {}).accessibilityIdentifier("HinefovigocEzehefuc.honeGolepu")
                Button("Jeb wajih je dobe ticu") {}
                Button("Wikop wajih teg kavemag") {}
                Button("Veg monuw") {}
                Text("Sheet body")
            }
            .navigationTitle("Filter").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") {} } }
        }
        .onAppear { alert = true }
        .alert("Delete ticket?", isPresented: $alert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {}
        } message: { Text("This cannot be undone.") }
    }
}
