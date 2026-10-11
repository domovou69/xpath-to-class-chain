import SwiftUI

// Phase 3: the `scale` screen. The tree comes from scale.json (written by ../make-scale.js);
// `-load 100|500|1000|2000` picks the groups. Everything below stays in the accessibility tree on an
// iPhone although only the Checkout page is on screen:
//   G2 screens underneath (a ZStack-based navigator keeps them mounted, covered by the page)
//   G1 the Checkout page (targets), then G3 its long non-lazy feed below the fold
//   G4 a drawer mounted off-screen to the left, kept-alive tabs in a pager off-screen to the right,
//      and the tab bar
// (A plain NavigationStack/UINavigationController drops earlier screens from the tree, and SwiftUI
// drops views with opacity 0, so neither is used.)
struct SNode: Decodable {
    let t: String
    let l: String?
    let id: String?
    let v: String?
    let k: [SNode]?

    var node: N {
        let kids = (k ?? []).map(\.node)
        switch t {
        case "text": return .text(l ?? "", id: id, value: v)
        case "button": return .button(l ?? "", id: id, value: v)
        case "field": return .field(placeholder: l ?? "", id: id)
        case "row": return .row(kids)
        default: return .box(id: id, label: l, value: v, kids)
        }
    }
}

struct ScaleData: Decodable {
    struct G4: Decodable { let drawer: [SNode]; let tabs: [[SNode]]; let tabbar: [SNode] }
    let g1: [SNode]
    let g2: [[SNode]]
    let g3: [SNode]
    let g4: G4
    let deep: [SNode]

    static let shared: ScaleData = {
        let url = Bundle.main.url(forResource: "scale", withExtension: "json")!
        return try! JSONDecoder().decode(ScaleData.self, from: Data(contentsOf: url))
    }()
}

struct ScaleScreen: View {
    let load: Int
    private let d = ScaleData.shared

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                if load >= 500 {
                    ForEach(d.g2.indices, id: \.self) { i in
                        ScrollView { LabScreen(nodes: d.g2[i].map(\.node)) }.background(Color(.systemBackground))
                    }
                }
                ScrollView { ScaleList(nodes: d.g1 + (load >= 1000 ? d.g3 : [])) }
                    .background(Color(.systemBackground))
                if load >= 2000 {
                    ScrollView { LabScreen(nodes: d.g4.drawer.map(\.node)) }
                        .frame(width: w * 0.8).background(Color(.secondarySystemBackground)).offset(x: -w)
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(d.g4.tabs.indices, id: \.self) { i in
                            ScrollView { LabScreen(nodes: d.g4.tabs[i].map(\.node)) }.frame(width: w)
                        }
                    }
                    .offset(x: w)
                    VStack { Spacer(); LabScreen(nodes: [.row(d.g4.tabbar.map(\.node))]).fixedSize(horizontal: false, vertical: true).background(Color(.systemBackground)) }
                }
            }
        }
    }
}

// The depth check: one chain of 70 nested boxes with a marker text every 5 levels.
struct ScaleDeepScreen: View {
    var body: some View { ScrollView { ScaleList(nodes: ScaleData.shared.deep) } }
}

// Like LabScreen, but a `kit` node renders its subtree with UIKit. SwiftUI merges a container whose
// only child is another container into one accessibility element, so a deep single-child chain
// (like the view nesting of React Native and other hybrid apps) can only be built from UIViews.
struct ScaleList: View {
    let nodes: [SNode]
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(nodes.indices, id: \.self) { i in
                if nodes[i].t == "kit" { KitTree(nodes: nodes[i].k ?? []) } else { NodeView(nodes[i].node) }
            }
        }
        .padding(.horizontal, 8)
    }
}

struct KitTree: UIViewRepresentable {
    let nodes: [SNode]
    func makeUIView(context: Context) -> UIView { Self.stack(nodes) }
    func updateUIView(_ uiView: UIView, context: Context) {}
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIView, context: Context) -> CGSize? {
        let w = proposal.width ?? 300
        return CGSize(width: w, height: uiView.systemLayoutSizeFitting(CGSize(width: w, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height)
    }
    static func stack(_ ns: [SNode]) -> UIStackView {
        let v = UIStackView(arrangedSubviews: ns.map(view)); v.axis = .vertical; v.alignment = .leading; v.spacing = 1
        return v
    }
    static func view(_ n: SNode) -> UIView {
        switch n.t {
        case "text":
            let l = UILabel(); l.text = n.l; l.font = .systemFont(ofSize: 11); l.accessibilityIdentifier = n.id
            if let v = n.v { l.accessibilityValue = v }
            return l
        case "button":
            let b = UIButton(type: .system); b.setTitle(n.l, for: .normal); b.titleLabel?.font = .systemFont(ofSize: 11)
            b.accessibilityIdentifier = n.id
            return b
        case "field":
            let f = UITextField(); f.placeholder = n.l; f.font = .systemFont(ofSize: 11); f.accessibilityIdentifier = n.id
            f.widthAnchor.constraint(equalToConstant: 160).isActive = true
            return f
        case "row":
            let v = stack(n.k ?? []); v.axis = .horizontal; v.spacing = 4
            return v
        default:
            // a box: an identified container, inset a little so its frame differs from its child's
            let v = stack(n.k ?? []); v.isLayoutMarginsRelativeArrangement = true
            v.layoutMargins = UIEdgeInsets(top: 0, left: 2, bottom: 0, right: 0)
            v.accessibilityIdentifier = n.id; v.accessibilityLabel = n.l
            return v
        }
    }
}
