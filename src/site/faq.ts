import { L } from "../i18n.ts";
import { h, icon } from "../ui/dom.ts";

export function faq(): HTMLElement {
  const qa = [
    [L("Is it AI?", "Είναι AI;"), L("By default it uses transparent rules that run on your device, and every screen says so. If whoever hosts MIRROR connects an AI model, you can switch to it in Settings; its answers are checked before they're shown and labelled as AI.", "Από προεπιλογή χρησιμοποιεί διαφανείς κανόνες που τρέχουν στη συσκευή σου, και κάθε οθόνη το λέει. Αν όποιος φιλοξενεί το MIRROR συνδέσει μοντέλο AI, μπορείς να το επιλέξεις στις Ρυθμίσεις· οι απαντήσεις του ελέγχονται πριν εμφανιστούν και σημειώνονται ως AI.")],
    [L("Where is my data?", "Πού είναι τα δεδομένα μου;"), L("In your browser, on this device. Nothing is uploaded unless you turn on server AI, which sends a decision's text only when you ask for an analysis.", "Στον browser σου, σε αυτή τη συσκευή. Τίποτα δεν ανεβαίνει, εκτός αν ενεργοποιήσεις το AI διακομιστή, που στέλνει το κείμενο μιας απόφασης μόνο όταν ζητάς ανάλυση.")],
    [L("What does it cost?", "Πόσο κοστίζει;"), L("Nothing. This version of MIRROR is free.", "Τίποτα. Αυτή η έκδοση του MIRROR είναι δωρεάν.")],
    [L("Does it work on my phone?", "Λειτουργεί στο κινητό μου;"), L("Yes, and you can add it to your home screen. Decisions stay on the device you used, so export a file to move them.", "Ναι, και μπορείς να το προσθέσεις στην αρχική οθόνη. Οι αποφάσεις μένουν στη συσκευή που χρησιμοποίησες, οπότε κάνε εξαγωγή για να τις μεταφέρεις.")],
    [L("Can I use it for medical, legal or money decisions?", "Μπορώ να το χρησιμοποιήσω για ιατρικές, νομικές ή οικονομικές αποφάσεις;"), L("It can help you organise your questions, and it says so when a topic needs a qualified professional. It doesn't replace their advice.", "Μπορεί να σε βοηθήσει να οργανώσεις τις ερωτήσεις σου, και το λέει όταν ένα θέμα χρειάζεται ειδικό. Δεν αντικαθιστά τη συμβουλή του.")],
  ];
  return h("section", { class: "faq-sec", id: "faq", "aria-labelledby": "faq-h" },
    h("div", { class: "wrap faq-grid" },
      h("h2", { class: "sec-title", id: "faq-h" }, L("Questions", "Ερωτήσεις")),
      h("div", { class: "faq" }, ...qa.map(([q, a]) => h("details", null, h("summary", null, h("span", null, q), icon("plus")), h("p", null, a))))));
}
