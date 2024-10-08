const baseName = "click-to-component-browser-extension";
const targetName = `${baseName}-target`;
const unknownComponentName = "Unknown Component";

console.warn(`[${baseName}] enabled`);

// this funciton will update after popover is defined
let hidePopover = function () {};

function getReactInstanceForElement(element) {
  // Prefer React DevTools, which has direct access to `react-dom` for mapping `element` <=> Fiber
  if ("__REACT_DEVTOOLS_GLOBAL_HOOK__" in window) {
    // @ts-expect-error - TS2339 - Property '__REACT_DEVTOOLS_GLOBAL_HOOK__' does not exist on type 'Window & typeof globalThis'.
    const { renderers } = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    for (const renderer of renderers.values()) {
      try {
        const fiber = renderer.findFiberByHostInstance(element);

        if (fiber) {
          return fiber;
        }
        // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // If React is mid-render, references to previous nodes may disappear during the click events
        // (This is especially true for interactive elements, like menus)
      }
    }
  }

  if ("_reactRootContainer" in element) {
    // @ts-expect-error - TS2339 - Property '_reactRootContainer' does not exist on type 'HTMLElement'.
    return element._reactRootContainer._internalRoot.current.child;
  }

  for (const key in element) {
    // Pre-Fiber access React internals
    if (key.startsWith("__reactInternalInstance$")) {
      return element[key];
    }

    // Fiber access to React internals
    if (key.startsWith("__reactFiber")) {
      return element[key];
    }
  }
}

function getSourceForReactInstance({ _debugSource, _debugOwner }) {
  // source is sometimes stored on _debugOwner
  const source = _debugSource || (_debugOwner && _debugOwner._debugSource);

  if (!source) return;

  const {
    // It _does_ exist!
    // @ts-ignore Property 'columnNumber' does not exist on type 'Source'.ts(2339)
    columnNumber = 1,
    fileName,
    lineNumber = 1,
  } = source;

  return { columnNumber, fileName, lineNumber };
}

function setTarget(el, type = "") {
  el.setAttribute(targetName, type);
}

function cleanTarget(type) {
  let targetElList = null;
  if (type) {
    targetElList = document.querySelectorAll(`[${targetName}="${type}"]`);
  } else {
    targetElList = document.querySelectorAll(`[${targetName}]`);
  }

  targetElList.forEach((el) => {
    el.removeAttribute(targetName);
  });
}

function parseSourceCodeLocation(sourceCodeLocation) {
  const [fileName, lineNumber, columnNumber] = sourceCodeLocation.split(":");

  return { columnNumber, fileName, lineNumber };
}

function getSourceCodeLocationString(sourceCodeLocation) {
  const { columnNumber, fileName, lineNumber } = sourceCodeLocation;
  return `${fileName}:${lineNumber}:${columnNumber}`;
}

function getElSourceCodeLocation(el) {
  // __sourceCodeLocation (vue-click-to-component)
  const dataSourceCodeLocationStr = el?.dataset?.__sourceCodeLocation;
  if (dataSourceCodeLocationStr) {
    const sourceCodeLocation = parseSourceCodeLocation(
      dataSourceCodeLocationStr,
    );
    return sourceCodeLocation;
  }

  // react
  const instance = getReactInstanceForElement(el);
  if (instance) {
    const sourceCodeLocation = getSourceForReactInstance(instance);
    return sourceCodeLocation;
  }
}

function getElWithSourceCodeLocation(el) {
  try {
    while (el) {
      const sourceCodeLocation = getElSourceCodeLocation(el);

      if (sourceCodeLocation) {
        return {
          el,
          sourceCodeLocation,
        };
      }

      el = el.parentElement;
    }
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    // do nothing
  }
}

function openEditor(sourceCodeLocationStr) {
  // __CLICK_TO_COMPONENT_URL_FUNCTION__ can be async
  const urlPromise = Promise.resolve().then(() => {
    if (typeof window.__CLICK_TO_COMPONENT_URL_FUNCTION__ !== "function") {
      if (sourceCodeLocationStr.startsWith("/")) {
        return `vscode://file${sourceCodeLocationStr}`;
      }

      return `vscode://file/${sourceCodeLocationStr}`;
    }

    return window.__CLICK_TO_COMPONENT_URL_FUNCTION__(sourceCodeLocationStr);
  });

  urlPromise
    .then((url) => {
      if (!url) {
        console.error(
          `[${baseName}] url is empty, please check __CLICK_TO_COMPONENT_URL_FUNCTION__`,
        );
        return;
      }

      window.open(url);
    })
    .catch((e) => {
      console.error(e);
    })
    .finally(() => {
      cleanTarget();
    });
}

function initAltClick() {
  const style = document.createElement("style");
  style.textContent = `
[${baseName}] * {
  pointer-events: auto !important;
}

[${targetName}] {
  cursor: var(--${baseName}-cursor, context-menu) !important;
  outline: 1px auto !important;
}

@supports (outline-color: Highlight) {
  [${targetName}] {
    outline: var(--${baseName}-outline, 1px auto Highlight) !important;
  }
}

@supports (outline-color: -webkit-focus-ring-color) {
  [${targetName}] {
    outline: var(--${baseName}-outline, 1px auto -webkit-focus-ring-color) !important;
  }
}`.trim();
  document.documentElement.appendChild(style);

  window.addEventListener(
    "click",
    (e) => {
      if (e.altKey && e.button === 0) {
        const elWithSourceCodeLocation = getElWithSourceCodeLocation(e.target);

        if (elWithSourceCodeLocation) {
          const { sourceCodeLocation } = elWithSourceCodeLocation;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const sourceCodeLocationStr =
            getSourceCodeLocationString(sourceCodeLocation);

          openEditor(sourceCodeLocationStr);
        }
      }

      hidePopover();
    },
    true,
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      cleanTarget("hover");

      if (e.altKey) {
        const elWithSourceCodeLocation = getElWithSourceCodeLocation(e.target);

        if (!elWithSourceCodeLocation) {
          return;
        }

        const { el } = elWithSourceCodeLocation;

        setTarget(el, "hover");
      }
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Alt") {
        cleanTarget();
      }
    },
    true,
  );

  window.addEventListener(
    "blur",
    () => {
      cleanTarget();
    },
    true,
  );
}

function initPopover() {
  const anchorName = `${baseName}-anchor`;
  const popoverName = `${baseName}-popover`;
  function cleanAndSetAnchor(el) {
    document.querySelectorAll(`[${anchorName}]`).forEach((el) => {
      el.removeAttribute(anchorName);
    });

    el.setAttribute(anchorName, "");
  }

  function getElListWithSourceCodeLocation(el) {
    const elWithSourceCodeLocationList = [];

    let elWithSourceCodeLocation = getElWithSourceCodeLocation(el);

    while (elWithSourceCodeLocation) {
      elWithSourceCodeLocationList.push(elWithSourceCodeLocation);

      const { el } = elWithSourceCodeLocation;
      elWithSourceCodeLocation = getElWithSourceCodeLocation(el.parentElement);
    }

    return elWithSourceCodeLocationList;
  }

  customElements.define(
    popoverName,
    class extends HTMLElement {
      static get observedAttributes() {
        return [];
      }

      constructor() {
        super();

        this.componentInfoList = [];

        this.setStyle();
        this.setForm();
      }

      updateComponentInfoList(componentInfoList) {
        this.componentInfoList = componentInfoList;
        this.listEl.innerHTML = "";

        for (const item of componentInfoList) {
          const itemEL = document.createElement("li");
          itemEL.classList.add(`${popoverName}__list__item`);

          const buttonEl = document.createElement("button");
          const sourceCodeLocationStr = getSourceCodeLocationString(
            item.sourceCodeLocation,
          );
          buttonEl.type = "submit";
          buttonEl.value = sourceCodeLocationStr;
          buttonEl.addEventListener("mouseenter", () => {
            setTarget(item.el, "popover");
          });
          buttonEl.addEventListener("mouseleave", () => {
            cleanTarget();
          });
          buttonEl.innerHTML = `<code class="${popoverName}__list__item__local-name">&lt;${item?.el?.localName || unknownComponentName}&gt;</code>
<cite class="${popoverName}__list__item__source-code-location">${sourceCodeLocationStr.replace(/.*(src|pages)/, '$1')}</cite>`;

          itemEL.appendChild(buttonEl);

          this.listEl.appendChild(itemEL);
        }
      }

      setForm() {
        const formEl = document.createElement("form");
        formEl.classList.add(`${popoverName}__form`);
        formEl.addEventListener("submit", (e) => {
          e.preventDefault();

          const submitter = e.submitter;

          if (submitter.tagName !== "BUTTON") {
            return;
          }

          const sourceCodeLocationStr = submitter.value;

          if (!sourceCodeLocationStr) {
            return;
          }

          openEditor(sourceCodeLocationStr);
          hidePopover();
        });

        const listEl = document.createElement("ul");
        listEl.classList.add(`${popoverName}__list`);
        formEl.appendChild(listEl);
        this.listEl = listEl;

        this.appendChild(formEl);
      }

      setStyle() {
        const styleEl = document.createElement("style");
        styleEl.textContent = `
.${popoverName}__list {
display: flex;
flex-direction: column;
gap: 2px;
padding: 0;
margin: 0;
list-style: none;
max-height: 300px;
overflow-y: auto;
}

.${popoverName}__list__item {
button {
  all: unset;
  box-sizing: border-box;
  outline: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;

  &:hover, &:focus, &:active {
    cursor: pointer;
    background: royalblue;
    color: white;
    box-shadow: var(--shadow-elevation-medium);

    code {
      color: white;
    }
  }

  code {
    color: royalblue;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }

  cite {
    font-weight: normal;
    font-style: normal;
    font-size: 12px;
    opacity: 0.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }
}
}`;

        this.appendChild(styleEl);
      }
    },
  );

  document.body.insertAdjacentHTML(
    "beforeend",
    `
<style type="text/css" key="${popoverName}-style">
[${anchorName}] {
  anchor-name: --${anchorName};
}

${popoverName} {
  position: fixed;
  position-anchor: --${anchorName};
  position-area: bottom;
  position-try-fallbacks: flip-block;
  position-try-order: most-height;

  margin: 0;
}
</style>
<${popoverName} popover="manual"></${popoverName}>`,
  );

  const vueClickToComponentPopoverEl = document.querySelector(popoverName);

  window.addEventListener(
    "contextmenu",
    (e) => {
      if (e.altKey && e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const elListWithSourceCodeLocationList =
          getElListWithSourceCodeLocation(e.target);

        if (elListWithSourceCodeLocationList.length === 0) {
          return;
        }

        const { el } = elListWithSourceCodeLocationList[0];

        cleanAndSetAnchor(el);

        vueClickToComponentPopoverEl.updateComponentInfoList(elListWithSourceCodeLocationList);

        vueClickToComponentPopoverEl.showPopover();
        document.activeElement.blur();
      }
    },
    true,
  );

  hidePopover = function () {
    vueClickToComponentPopoverEl.hidePopover();
  };
}

try {
  initAltClick();
} catch (error) {
  console.warn(`[${baseName}] init failed`, error);
}

try {
  initPopover();
} catch (error) {
  console.warn(`[${baseName}] init popover failed`, error);
}
