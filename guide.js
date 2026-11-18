"use strict";

{
  const copyButton = document.getElementById("copy-template");
  const template = document.getElementById("guide-template");
  const copyStatus = document.getElementById("guide-copy-status");
  copyButton.hidden = false;

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(template.value);
      copyStatus.textContent = "已复制观察模板。";
    } catch {
      template.focus();
      template.select();
      copyStatus.textContent = "已选中模板，可手动复制。";
    }
    copyStatus.hidden = false;
  });
}
