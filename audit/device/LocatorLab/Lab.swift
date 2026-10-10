import SwiftUI
import UIKit

// A small tree DSL so each screen reads like the page source it produces.
// SwiftUI on iOS 27 maps these to XCUIElementType* as follows (checked on the simulator):
//   text      → StaticText (name = identifier, else label; value = label unless set)
//   button    → Button (no StaticText child, unlike UIButton)
//   box       → Other via .accessibilityElement(children: .contain), with direct children
//   combined  → StaticText via .combine; the original texts stay as StaticText children
//   buttonBox → Button with children (.contain + .isButton trait)
//   table     → UIKit UITableView: Table / Cell with direct children (see KitTable)
//   window    → UIKit views added straight to the UIWindow (direct children of Window)
indirect enum N {
    case text(String, id: String? = nil, value: String? = nil)
    case button(String, id: String? = nil, value: String? = nil, enabled: Bool = true, selected: Bool = false)
    case box(id: String? = nil, label: String? = nil, value: String? = nil, _ kids: [N])
    case combined(id: String? = nil, _ kids: [N])
    case buttonBox(id: String? = nil, label: String, _ kids: [N])
    case image(String, id: String)
    case field(placeholder: String, id: String? = nil)
    case secure(placeholder: String, id: String? = nil)
    case textView(String, id: String? = nil)
    case toggle(String, id: String? = nil, on: Bool)
    case table(id: String? = nil, _ cells: [K])
    case scroll(id: String? = nil, height: CGFloat, _ kids: [N])
    case row([N])
    case web(id: String)
}

// UIKit nodes, used inside table cells and in the window overlay
indirect enum K {
    case text(String, id: String? = nil)
    case button(String, id: String? = nil, enabled: Bool = true)
    case box(id: String? = nil, label: String? = nil, _ kids: [K])
    case cell(id: String? = nil, label: String? = nil, _ kids: [K])
}

struct NodeView: View {
    let node: N
    init(_ node: N) { self.node = node }

    var body: some View { render(node) }

    private func render(_ n: N) -> AnyView {
        switch n {
        case let .text(label, id, value):
            return AnyView(Text(label).font(.caption2).fixedSize(horizontal: false, vertical: true)
                .modifier(Ident(id)).modifier(Val(value)))
        case let .button(label, id, value, enabled, selected):
            return AnyView(Button(label) {}.font(.caption2).disabled(!enabled).accessibilityAddTraits(selected ? .isSelected : [])
                .modifier(Ident(id)).modifier(Val(value)))
        case let .box(id, label, value, kids):
            return AnyView(stack(kids).padding(.leading, 6)
                .accessibilityElement(children: .contain).modifier(Ident(id)).modifier(Lbl(label)).modifier(Val(value)))
        case let .combined(id, kids):
            return AnyView(stack(kids).accessibilityElement(children: .combine).modifier(Ident(id)))
        case let .buttonBox(id, label, kids):
            return AnyView(stack(kids).padding(.leading, 6)
                .accessibilityElement(children: .contain).accessibilityAddTraits(.isButton).accessibilityLabel(label).modifier(Ident(id)))
        case let .image(name, id):
            return AnyView(Image(systemName: name).accessibilityIdentifier(id))
        case let .field(placeholder, id):
            return AnyView(FieldView(placeholder: placeholder, secure: false).modifier(Ident(id)))
        case let .secure(placeholder, id):
            return AnyView(FieldView(placeholder: placeholder, secure: true).modifier(Ident(id)))
        case let .textView(text, id):
            return AnyView(TextViewNode(text: text).frame(height: 44).modifier(Ident(id)))
        case let .toggle(label, id, on):
            return AnyView(ToggleNode(label: label, on: on).modifier(Ident(id)))
        case let .table(id, cells):
            return AnyView(KitTable(id: id, cells: cells).frame(height: CGFloat(cells.count) * 44))
        case let .scroll(id, height, kids):
            return AnyView(ScrollView { stack(kids) }.frame(height: height).modifier(Ident(id)))
        case let .row(kids):
            return AnyView(HStack(spacing: 4) { ForEach(kids.indices, id: \.self) { i in NodeView(kids[i]) } })
        case let .web(id):
            return AnyView(WebNode().frame(height: 40).accessibilityIdentifier(id))
        }
    }

    private func stack(_ kids: [N]) -> some View {
        VStack(alignment: .leading, spacing: 1) { ForEach(kids.indices, id: \.self) { i in NodeView(kids[i]) } }
    }
}

struct Ident: ViewModifier {
    let id: String?
    init(_ id: String?) { self.id = id }
    func body(content: Content) -> some View { if let id { content.accessibilityIdentifier(id) } else { content } }
}
struct Lbl: ViewModifier {
    let label: String?
    init(_ label: String?) { self.label = label }
    func body(content: Content) -> some View { if let label { content.accessibilityLabel(label) } else { content } }
}
struct Val: ViewModifier {
    let value: String?
    init(_ value: String?) { self.value = value }
    func body(content: Content) -> some View { if let value { content.accessibilityValue(value) } else { content } }
}

struct FieldView: View {
    let placeholder: String
    let secure: Bool
    @State private var text = ""
    var body: some View {
        if secure { SecureField(placeholder, text: $text).font(.caption2) } else { TextField(placeholder, text: $text).font(.caption2) }
    }
}
struct ToggleNode: View {
    let label: String
    @State var on: Bool
    var body: some View { Toggle(label, isOn: $on).font(.caption2) }
}
struct TextViewNode: View {
    @State var text: String
    var body: some View { TextEditor(text: $text).font(.caption2) }
}

// Screen = a vertical list of nodes; `window` nodes are added straight to the UIWindow.
struct LabScreen: View {
    let nodes: [N]
    var window: [K] = []
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(nodes.indices, id: \.self) { i in NodeView(nodes[i]) }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .onAppear { if !window.isEmpty { WindowOverlay.install(window) } }
    }
}

// ---------- UIKit
enum KitBuild {
    // Builds a vertical stack of UIKit nodes; returns the view and its height.
    static func view(_ k: K) -> UIView {
        switch k {
        case let .text(t, id):
            let l = UILabel(); l.text = t; l.font = .systemFont(ofSize: 11); l.accessibilityIdentifier = id
            return l
        case let .button(t, id, enabled):
            let b = UIButton(type: .system); b.setTitle(t, for: .normal); b.titleLabel?.font = .systemFont(ofSize: 11)
            b.isEnabled = enabled; b.accessibilityIdentifier = id
            return b
        case let .box(id, label, kids), let .cell(id, label, kids):
            let v = UIStackView(arrangedSubviews: kids.map(view)); v.axis = .vertical; v.spacing = 1
            v.accessibilityIdentifier = id; v.accessibilityLabel = label
            return v
        }
    }
}

struct KitTable: UIViewRepresentable {
    let id: String?
    let cells: [K]
    func makeUIView(context: Context) -> UITableView {
        let t = UITableView(frame: .zero, style: .plain)
        t.dataSource = context.coordinator; t.rowHeight = 44; t.isScrollEnabled = false
        t.accessibilityIdentifier = id
        return t
    }
    func updateUIView(_ uiView: UITableView, context: Context) {}
    func makeCoordinator() -> DS { DS(cells) }
    final class DS: NSObject, UITableViewDataSource {
        let cells: [K]
        init(_ cells: [K]) { self.cells = cells }
        func tableView(_ t: UITableView, numberOfRowsInSection s: Int) -> Int { cells.count }
        func tableView(_ t: UITableView, cellForRowAt ip: IndexPath) -> UITableViewCell {
            let c = UITableViewCell(style: .default, reuseIdentifier: nil)
            guard case let .cell(id, label, kids) = cells[ip.row] else { return c }
            c.accessibilityIdentifier = id; c.accessibilityLabel = label
            var x: CGFloat = 8
            for k in kids {
                let v = KitBuild.view(k); let w = max(60, v.intrinsicContentSize.width + 8)
                v.frame = CGRect(x: x, y: 4, width: w, height: 36); x += w + 8
                c.contentView.addSubview(v)
            }
            return c
        }
    }
}

enum WindowOverlay {
    static func install(_ nodes: [K]) {
        DispatchQueue.main.async {
            guard let w = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first else { return }
            // inserted below the hosting view, in order, so they come first among Window's children
            var y: CGFloat = w.bounds.height - 120
            var overlay: [Any] = []
            for (i, k) in nodes.enumerated() {
                let v = KitBuild.view(k)
                v.frame = CGRect(x: 8, y: y, width: w.bounds.width - 16, height: 36); y += 40
                w.insertSubview(v, at: i)
                overlay.append(v)
            }
            // accessibility order follows geometry by default; put the overlay first explicitly
            w.accessibilityElements = overlay + (w.rootViewController.map { [$0.view as Any] } ?? [])
        }
    }
}

// An empty WKWebView: nothing is loaded, so its subtree cannot change while cases run
import WebKit
struct WebNode: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        WKWebView()
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
