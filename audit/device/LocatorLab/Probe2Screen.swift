import SwiftUI
import UIKit

struct Probe2Screen: View {
    var body: some View {
        VStack {
            Text("probe2")
            Probe2Kit().frame(height: 300)
        }
        .onAppear { Probe2Kit.injectIntoWindow() }
    }
}

struct Probe2Kit: UIViewRepresentable {
    static func injectIntoWindow() {
        DispatchQueue.main.async {
            guard let w = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first else { return }
            let b = UIButton(type: .system); b.setTitle("winBtn", for: .normal); b.accessibilityIdentifier = "directInWindow"
            b.frame = CGRect(x: 10, y: 700, width: 120, height: 30); w.addSubview(b)
            let box = UIView(frame: CGRect(x: 150, y: 700, width: 200, height: 40)); box.accessibilityIdentifier = "winBox"
            let b2 = UIButton(type: .system); b2.setTitle("inWinBox", for: .normal); b2.frame = CGRect(x: 0, y: 0, width: 100, height: 30); box.addSubview(b2)
            w.addSubview(box)
        }
    }
    func makeUIView(context: Context) -> UIView {
        let root = UIView()
        let box = UIView(frame: CGRect(x: 0, y: 0, width: 300, height: 60)); box.accessibilityIdentifier = "kitBox"
        let l = UILabel(frame: CGRect(x: 0, y: 0, width: 140, height: 20)); l.text = "kit label"; box.addSubview(l)
        let b = UIButton(type: .system); b.setTitle("kit button", for: .normal); b.frame = CGRect(x: 150, y: 0, width: 140, height: 30); box.addSubview(b)
        root.addSubview(box)
        let box2 = UIView(frame: CGRect(x: 0, y: 60, width: 300, height: 30)) // no identifier
        let l2 = UILabel(frame: CGRect(x: 0, y: 0, width: 140, height: 20)); l2.text = "anon box label"; box2.addSubview(l2); root.addSubview(box2)
        let t = UITableView(frame: CGRect(x: 0, y: 100, width: 380, height: 180)); t.accessibilityIdentifier = "kitTable"
        t.dataSource = context.coordinator; root.addSubview(t)
        return root
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
    func makeCoordinator() -> DS { DS() }
    final class DS: NSObject, UITableViewDataSource {
        func tableView(_ t: UITableView, numberOfRowsInSection s: Int) -> Int { 2 }
        func tableView(_ t: UITableView, cellForRowAt ip: IndexPath) -> UITableViewCell {
            let c = UITableViewCell(style: .default, reuseIdentifier: nil)
            c.accessibilityIdentifier = "kcell\(ip.row)"
            let b = UIButton(type: .system); b.setTitle("cbtn\(ip.row)", for: .normal); b.frame = CGRect(x: 10, y: 5, width: 100, height: 30)
            c.contentView.addSubview(b)
            let inner = UIView(frame: CGRect(x: 120, y: 5, width: 200, height: 30)); inner.accessibilityIdentifier = "innerBox\(ip.row)"
            let l = UILabel(frame: CGRect(x: 0, y: 0, width: 100, height: 20)); l.text = "inner text \(ip.row)"; inner.addSubview(l)
            c.contentView.addSubview(inner)
            return c
        }
    }
}
