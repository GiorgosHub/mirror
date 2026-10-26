/* The MIRROR website, one module per section. No testimonials, numbers or claims that aren't true of this product. */
import type { App } from "../ui/app.ts";
import { h } from "../ui/dom.ts";
import { hero } from "./hero.ts";
import { story } from "./story.ts";
import { demoSection } from "./demo.ts";
import { language } from "./language.ts";
import { principles } from "./principles.ts";
import { faq } from "./faq.ts";
import { closing } from "./closing.ts";

export function siteView(app: App): Node {
  return h("div", { class: "site" }, hero(app), story(), demoSection(app), language(), principles(), faq(), closing(app));
}
