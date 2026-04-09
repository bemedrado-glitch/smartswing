(() => {
  const TARGET_ORIGIN = "https://www.smartswingai.com";
  const ANALYZER_PATH = "/analyze.html";

  const exactRoutes = {
    "/": "/",
    "/home": "/",
    "/features": "/features.html",
    "/how-it-works": "/how-it-works.html",
    "/pricing": "/pricing.html",
    "/plans": "/pricing.html",
    "/plans-pricing": "/pricing.html",
    "/contact": "/contact.html",
    "/login": "/login.html",
    "/sign-up": "/signup.html",
    "/signup": "/signup.html",
    "/register": "/signup.html",
    "/drills": "/library.html",
    "/library": "/library.html",
    "/review": "/",
    "/review-all": "/",
    "/quiz-tennis-1": ANALYZER_PATH,
    "/free-analysis": ANALYZER_PATH,
    "/free-assessment": ANALYZER_PATH,
    "/try-now": ANALYZER_PATH,
    "/refer-friends": "/signup.html",
    "/blog": "/"
  };

  const legalPages = [
    /^\/privacy-policy\/?$/i,
    /^\/accessibility-statement\/?$/i,
    /^\/terms(?:-|%20)?(?:and|-|%20)?(?:conditions)\/?$/i,
    /^\/refund-policy\/?$/i
  ];

  const ctaTextPattern = /(start free analysis|free analysis|free assessment|try now|get my first free assessment|claim free analysis|start free|unlock starter)/i;

  function normalizePath(pathname) {
    if (!pathname) {
      return "/";
    }

    const clean = pathname
      .replace(/\/+$/, "")
      .trim()
      .toLowerCase();

    return clean || "/";
  }

  function isLegalPage(pathname) {
    return legalPages.some((pattern) => pattern.test(pathname));
  }

  function buildTarget(pathname, search, hash) {
    const normalized = normalizePath(pathname);
    const mapped = exactRoutes[normalized];

    if (mapped) {
      return `${TARGET_ORIGIN}${mapped}${search || ""}${hash || ""}`;
    }

    if (!isLegalPage(normalized)) {
      return `${TARGET_ORIGIN}/${search || ""}${hash || ""}`.replace(/\/\?/, "/?");
    }

    return null;
  }

  function forceAnalyzer(link) {
    if (!link) {
      return;
    }

    link.setAttribute("href", `${TARGET_ORIGIN}${ANALYZER_PATH}`);
    link.setAttribute("target", "_self");
  }

  function decorateLegalPageCtas() {
    document.querySelectorAll("a, button, [role='button']").forEach((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!ctaTextPattern.test(text)) {
        return;
      }

      if (node.tagName === "A") {
        forceAnalyzer(node);
        return;
      }

      node.addEventListener("click", () => {
        window.location.href = `${TARGET_ORIGIN}${ANALYZER_PATH}`;
      });
    });

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target.closest("a");
        if (!target) {
          return;
        }

        const text = (target.textContent || "").replace(/\s+/g, " ").trim();
        const href = (target.getAttribute("href") || "").toLowerCase();

        if (
          ctaTextPattern.test(text) ||
          href.includes("quiz-tennis") ||
          href.includes("free-analysis") ||
          href.includes("free-assessment")
        ) {
          event.preventDefault();
          window.location.href = `${TARGET_ORIGIN}${ANALYZER_PATH}`;
        }
      },
      true
    );
  }

  const redirectTarget = buildTarget(window.location.pathname, window.location.search, window.location.hash);
  if (redirectTarget && window.location.href !== redirectTarget) {
    window.location.replace(redirectTarget);
    return;
  }

  if (isLegalPage(normalizePath(window.location.pathname))) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", decorateLegalPageCtas, { once: true });
    } else {
      decorateLegalPageCtas();
    }
  }
})();
