import SwiftUI
import UIKit

// Not a test screen: shows how SwiftUI / UIKit constructs map to XCUIElementType* on this iOS.
struct ProbeScreen: View {
    @State private var on = true
    @State private var text = ""
    @State private var secret = ""
    var body: some View {
        NavigationStack {
            VStack(spacing: 4) {
                HStack {
                    Text("plain text")
                    Text("text with id").accessibilityIdentifier("textId")
                    Button("plain button") {}
                    Button("disabled") {}.disabled(true)
                }
                VStack { Text("in contain"); Button("btn in contain") {} }
                    .accessibilityElement(children: .contain).accessibilityIdentifier("containBox").accessibilityLabel("Contain label")
                VStack { Text("combined a"); Text("combined b") }
                    .accessibilityElement(children: .combine).accessibilityIdentifier("combineBox")
                Toggle("toggle", isOn: $on).accessibilityIdentifier("tgl")
                TextField("placeholder here", text: $text).accessibilityIdentifier("tf")
                SecureField("secret placeholder", text: $secret).accessibilityIdentifier("sf")
                Image(systemName: "star").accessibilityLabel("star image")
                Text("trait button").accessibilityAddTraits(.isButton)
                Text("value text").accessibilityValue("val 1").accessibilityIdentifier("valText")
                ProbeTable().frame(height: 160)
                List {
                    Section("Sec A") { Text("row a1"); Button("row a2") {} }
                }.frame(height: 160)
            }
            .navigationTitle("Probe")
            .toolbar { Button("Close") {} }
        }
    }
}

struct ProbeTable: UIViewRepresentable {
    func makeUIView(context: Context) -> UITableView {
        let t = UITableView(frame: .zero, style: .plain)
        t.dataSource = context.coordinator
        t.register(UITableViewCell.self, forCellReuseIdentifier: "c")
        t.accessibilityIdentifier = "probeTable"
        return t
    }
    func updateUIView(_ uiView: UITableView, context: Context) {}
    func makeCoordinator() -> DS { DS() }
    final class DS: NSObject, UITableViewDataSource {
        func tableView(_ t: UITableView, numberOfRowsInSection s: Int) -> Int { 2 }
        func tableView(_ t: UITableView, cellForRowAt ip: IndexPath) -> UITableViewCell {
            let c = t.dequeueReusableCell(withIdentifier: "c", for: ip)
            c.contentConfiguration = UIHostingConfiguration { HStack { Text("cell text \(ip.row)"); Button("cell btn \(ip.row)") {} } }
            c.accessibilityIdentifier = "tcell\(ip.row)"
            return c
        }
    }
}
