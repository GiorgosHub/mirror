/* What MIRROR won't do. Each line rises out of its own reflection as it reaches the middle of the screen. */
import { L } from "../i18n.ts";
import { h } from "../ui/dom.ts";
import { through } from "../fx/scroll.ts";
import { reducedMotion } from "../fx/loop.ts";

export function principles(): HTMLElement {
  const rows = [
    [L("It won't predict your future.", "Δεν θα προβλέψει το μέλλον σου."), L("Nobody can. MIRROR shows what could happen under which assumptions, and how sure anyone can be about it.", "Κανείς δεν μπορεί. Το MIRROR δείχνει τι θα μπορούσε να γίνει, με ποιες υποθέσεις, και πόσο σίγουρος μπορεί να είναι κανείς.")],
    [L("It won't choose for you.", "Δεν θα διαλέξει για σένα."), L("No ranking, no recommended option. It shows the trade-offs and the next thing worth finding out.", "Χωρίς κατάταξη, χωρίς προτεινόμενη επιλογή. Δείχνει τις αντισταθμίσεις και το επόμενο που αξίζει να μάθεις.")],
    [L("It won't keep your decisions.", "Δεν θα κρατήσει τις αποφάσεις σου."), L("Everything stays in your browser. No account and no tracking. Export a file or delete everything whenever you like.", "Όλα μένουν στον browser σου. Χωρίς λογαριασμό, χωρίς παρακολούθηση. Εξαγωγή σε αρχείο ή διαγραφή όλων όποτε θέλεις.")],
  ];
  const items = rows.map(([t, p]) => {
    const li = h("li", { class: "nv" },
      h("div", { class: "nv-line" }, h("div", { class: "nv-title" }, h("h3", null, t), h("div", { class: "nv-ghost", "aria-hidden": "true" }, t)), h("p", null, p)));
    if (!reducedMotion()) requestAnimationFrame(() => { if (li.isConnected) through(li, () => {}); });
    return li;
  });
  return h("section", { class: "nv-sec", id: "principles", "aria-labelledby": "nv-h" },
    h("div", { class: "wrap" },
      h("h2", { class: "sec-title", id: "nv-h" }, L("What it won't do", "Τι δεν θα κάνει")),
      h("ul", { class: "nv-list" }, ...items)));
}
