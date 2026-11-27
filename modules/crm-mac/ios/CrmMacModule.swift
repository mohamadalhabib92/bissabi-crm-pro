import ExpoModulesCore
import UIKit

/// Présent dans le binaire iOS. Sur iPhone la constante vaut false et aucun raccourci n’est installé.
public class CrmMacModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CrmMac")

    Constant("isiOSAppOnMac") {
      if #available(iOS 14.0, *) {
        return ProcessInfo.processInfo.isiOSAppOnMac
      }
      return false
    }

    Events("onKey")

    OnCreate {
      DispatchQueue.main.async { [weak self] in
        guard #available(iOS 14.0, *), ProcessInfo.processInfo.isiOSAppOnMac else { return }
        CrmMacKeys.install { key in
          self?.sendEvent("onKey", ["key": key])
        }
      }
    }
  }
}

enum CrmMacKeys {
  static var handler: ((String) -> Void)?
  private static var installed = false
  static var originalImp: IMP?
  private static let keySelector = #selector(getter: UIViewController.keyCommands)

  static func install(handler: @escaping (String) -> Void) {
    self.handler = handler
    guard !installed else { return }
    installed = true
    guard
      let original = class_getInstanceMethod(UIViewController.self, keySelector),
      let patched = class_getInstanceMethod(UIViewController.self, #selector(UIViewController.crm_keyCommands))
    else { return }
    originalImp = method_getImplementation(original)
    method_exchangeImplementations(original, patched)
  }

  static func commands() -> [UIKeyCommand] {
    let specs: [(String, UIKeyModifierFlags)] = [
      (UIKeyCommand.inputEscape, []),
      ("f", .command),
    ]
    return specs.map { input, flags in
      let command = UIKeyCommand(input: input, modifierFlags: flags, action: #selector(UIViewController.crm_onKey(_:)))
      if #available(iOS 15.0, *) {
        command.wantsPriorityOverSystemBehavior = true
      }
      return command
    }
  }

  static func existingCommands(on controller: UIViewController) -> [UIKeyCommand]? {
    guard let imp = originalImp else { return nil }
    let fn = unsafeBitCast(imp, to: (@convention(c) (AnyObject, Selector) -> [UIKeyCommand]?).self)
    return fn(controller, keySelector)
  }

  static func textInput() -> UIView? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
    return findTextInput(in: window)
  }

  private static func findTextInput(in view: UIView?) -> UIView? {
    guard let view else { return nil }
    if view.isFirstResponder && (view is UITextField || view is UITextView) { return view }
    for child in view.subviews {
      if let found = findTextInput(in: child) { return found }
    }
    return nil
  }
}

extension UIViewController {
  @objc func crm_keyCommands() -> [UIKeyCommand]? {
    let existing = CrmMacKeys.existingCommands(on: self)
    guard #available(iOS 14.0, *), ProcessInfo.processInfo.isiOSAppOnMac else { return existing }
    return (existing ?? []) + CrmMacKeys.commands()
  }

  @objc func crm_onKey(_ sender: UIKeyCommand) {
    let input = sender.input ?? ""
    if input == UIKeyCommand.inputEscape {
      if let text = CrmMacKeys.textInput() {
        text.resignFirstResponder()
        return
      }
      CrmMacKeys.handler?("escape")
      return
    }
    if input == "f", sender.modifierFlags.contains(.command) {
      CrmMacKeys.handler?("find")
    }
  }
}
