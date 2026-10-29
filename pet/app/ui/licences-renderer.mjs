import { startLicences } from "./licences.mjs";

await startLicences({
  listen: window.__TAURI__.event.listen,
  invoke: window.__TAURI__.core.invoke,
  render(view, language) {
    document.documentElement.lang = language;
    document.title = view.title;
    document.getElementById("title").textContent = view.title;
    const sections = view.sections.map(({ heading, text, preformatted }) => {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = heading;
      const content = document.createElement(preformatted ? "pre" : "p");
      content.textContent = text;
      section.append(title, content);
      return section;
    });
    document.getElementById("notices").replaceChildren(...sections);
  },
});
