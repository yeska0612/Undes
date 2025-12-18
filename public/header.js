const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");

toggle.addEventListener("click", () => {
  const open = header.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
});

document.querySelectorAll("#main-nav a").forEach((a) => {
  a.addEventListener("click", () => {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
});

const sections = document.querySelectorAll("section[id]");
const links = document.querySelectorAll(".nav-list a");

const byId = (id) =>
  [...links].find((a) => a.getAttribute("href") === `#${id}`);

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const link = byId(entry.target.id);
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
      }
    });
  },
  { rootMargin: "-40% 0px -50% 0px", threshold: 0.01 }
);

sections.forEach((s) => io.observe(s));
let lastScroll = 0;
const scrollThreshold = 10; 
const headerHeight = header.offsetHeight;

window.addEventListener("scroll", () => {
  const currentScroll =
    window.pageYOffset || document.documentElement.scrollTop;

  if (
    currentScroll > lastScroll + scrollThreshold &&
    currentScroll > headerHeight
  ) {
    header.classList.add("hide");
  }
  else if (currentScroll < lastScroll - scrollThreshold) {
    header.classList.remove("hide");
  }

  lastScroll = currentScroll <= 0 ? 0 : currentScroll; 
});
