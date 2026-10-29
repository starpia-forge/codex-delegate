import { createMessages, subscribeLanguage } from "./messages.mjs";

export function licencesView(notices, catalogue, language) {
  const message = createMessages(catalogue, language);
  // The release generator prefixes the crate list with these two documents.
  // Remove only that exact prefix; an unfamiliar document is shown in full so
  // a format change cannot silently discard legal text.
  const normalize = text => text.replace(/\r\n?/g, "\n");
  const prefix = `codex-delegate — MIT\n\n${normalize(notices.project)}\n\nFan-art notice\n\n${normalize(notices.fan_art)}`;
  const text = normalize(notices.text);
  const thirdParty = text.startsWith(prefix) ? text.slice(prefix.length).replace(/^\n+/, "") : text;
  return {
    title: message("licences.title"),
    sections: [
      { heading: message("licences.project"), text: notices.project, preformatted: true },
      { heading: message("licences.fanArt"), text: notices.fan_art, preformatted: true },
      { heading: message("licences.thirdParty"),
        text: notices.is_stub ? message("licences.generatedByRelease")
          : thirdParty.trim() ? thirdParty : message("licences.empty"),
        preformatted: !notices.is_stub && !!thirdParty.trim() },
    ],
  };
}

export async function startLicences({ listen, invoke, render }) {
  let language = "en", catalogue, notices;
  const refresh = () => {
    if (catalogue && notices) render(licencesView(notices, catalogue, language), language);
  };
  const subscription = await subscribeLanguage(listen, current => {
    language = current;
    refresh();
  });
  try {
    [catalogue, notices] = await Promise.all([
      invoke("messages"), subscription.read(() => invoke("notices")),
    ]);
    refresh();
    return subscription.unlisten;
  } catch (error) {
    subscription.unlisten();
    throw error;
  }
}
