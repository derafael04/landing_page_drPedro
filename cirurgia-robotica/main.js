import { createRobot, createState, K, JAW_HOLD, JAW_OPEN } from './robot.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const hero = document.getElementById('hero');
const beats = gsap.utils.toArray('.beat');
const scaleBar = document.getElementById('scaleBar');
const scaleLabel = document.getElementById('scaleLabel');

let robot = null;
try {
  robot = createRobot(canvas);
} catch (err) {
  console.warn('Cena 3D indisponível, página segue sem ela.', err);
}

if (robot) {
  stage.classList.add('has-scene');
  const s = createState();
  let dirty = true;
  let introduced = false;
  const invalidate = () => { dirty = true; };

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    robot.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, r.width < 740 ? 1.75 : 2));
    dirty = true;
  };
  new ResizeObserver(fit).observe(canvas);

  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; dirty = true; }).observe(canvas);

  const UNITS = [[1, '1 cm'], [2, '2 cm'], [5, '5 cm'], [10, '10 cm'], [20, '20 cm'], [50, '50 cm']];
  const drawScale = () => {
    const px = robot.pxPerCm();
    const [n, label] = UNITS.find(([k]) => px * k >= 34) || UNITS[UNITS.length - 1];
    scaleBar.style.width = `${(px * n).toFixed(1)}px`;
    if (scaleLabel.textContent !== label) scaleLabel.textContent = label;
  };

  gsap.ticker.add(() => {
    if (!dirty || !onScreen) return;
    dirty = false;
    robot.frame(s);
    drawScale();
  });

  const mm = gsap.matchMedia();
  mm.add(
    { any: 'all', reduce: '(prefers-reduced-motion: reduce)', narrow: '(max-width: 46rem)' },
    (ctx) => {
      const { reduce, narrow } = ctx.conditions;
      Object.assign(s, createState(), { intro: introduced || reduce ? 1 : 0 });

      // enquadramento: no celular a cena sobe e o texto fica embaixo
      const side = narrow ? 0 : 0.15;
      const lift = narrow ? 0.12 : 0;
      const far = narrow ? 1.5 : 1;
      const cam = (px, py, pz, tx, ty, tz, k = far) => ({
        cx: tx + (px - tx) * k, cy: ty + (py - ty) * k, cz: tz + (pz - tz) * k, tx, ty, tz,
      });
      const wide = narrow ? cam(0, 0.56, 3.0, 0, 0.36, -0.1, 1) : cam(0.02, 0.5, 2.25, 0, 0.33, -0.1, 1);
      Object.assign(s, wide, { fov: narrow ? 40 : 28, sx: narrow ? 0 : 0.2, sy: narrow ? 0.17 : 0 });

      stage.classList.toggle('is-live', !reduce);
      fit();
      dirty = true;

      if (!introduced && !reduce) {
        introduced = true;
        gsap.to(s, { intro: 1, duration: 2, delay: 0.25, ease: 'power3.out', onUpdate: invalidate });
      }
      if (reduce) return () => stage.classList.remove('is-live');

      s.grabAt = 4.9;
      s.releaseAt = 9.15;

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onUpdate: invalidate,
        scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom bottom', scrub: 0.8 },
      });

      tl.to(s, { t: 10, duration: 10, ease: 'none' }, 0);
      tl.to(hero, { autoAlpha: 0, y: -28, duration: 0.6, ease: 'power1.in' }, 0.08);

      // 1. aproximação: da sala inteira até a fruta
      tl.to(s, { ...cam(0.12, 0.085, 0.4, 0, 0.022, 0.1), fogN: 0.42, fogF: 1.3, sx: -side, sy: lift, duration: 2.3 }, 0.25);
      tl.to(s, { jaw: JAW_OPEN, duration: 0.5 }, 2.5);

      // 2. desce e fecha a pinça até encostar
      tl.to(s, { px: K.BERRY.x, py: K.BERRY.y, pz: K.BERRY.z, duration: 0.9, ease: 'power2.out' }, 3.0);
      tl.to(s, { ...cam(0.078, 0.042, 0.29, 0.002, 0.012, 0.1), sx: side, duration: 1.1 }, 2.9);
      tl.to(s, { jaw: JAW_HOLD, duration: 0.7, ease: 'power1.inOut' }, 4.2);

      // 3. levanta e gira o punho
      tl.to(s, { px: K.LIFT.x, py: K.LIFT.y, pz: K.LIFT.z, duration: 1.1 }, 5.1);
      tl.to(s, { ...cam(-0.075, 0.09, 0.37, 0.004, 0.064, 0.112), sx: -side, duration: 1.1 }, 5.1);
      tl.to(s, { roll: Math.PI * 2, duration: 1.6, ease: 'sine.inOut' }, 6.2);
      tl.to(s, { pitch: 0.7, duration: 0.55, ease: 'sine.inOut' }, 6.2);
      tl.to(s, { pitch: -0.6, duration: 0.6, ease: 'sine.inOut' }, 6.75);
      tl.to(s, { pitch: 0, duration: 0.45, ease: 'sine.inOut' }, 7.35);

      // 4. leva até o pires e solta
      tl.to(s, { px: K.DISH_ABOVE.x, py: K.DISH_ABOVE.y, pz: K.DISH_ABOVE.z, duration: 0.8 }, 7.8);
      tl.to(s, { ...cam(0.19, 0.115, 0.42, 0.066, 0.03, 0.118), sx: side, duration: 1.0 }, 7.8);
      tl.to(s, { px: K.DISH_REST.x, py: K.DISH_REST.y, pz: K.DISH_REST.z, duration: 0.5, ease: 'power1.out' }, 8.6);
      tl.to(s, { jaw: JAW_OPEN, duration: 0.3, ease: 'power1.out' }, 9.15);
      tl.to(s, { px: K.DISH_AWAY.x, py: K.DISH_AWAY.y, pz: K.DISH_AWAY.z, duration: 0.55 }, 9.45);
      tl.to(s, { ...cam(0.27, 0.19, 0.62, 0.06, 0.07, 0.1), fogN: 0.8, fogF: 2.4, duration: 0.7 }, 9.3);

      const windows = [[1.45, 3.2], [3.7, 5.5], [5.95, 7.75], [8.4, null]];
      beats.forEach((el, i) => {
        const [a, b] = windows[i];
        tl.fromTo(el, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power1.out' }, a);
        if (b) tl.to(el, { autoAlpha: 0, y: -14, duration: 0.35, ease: 'power1.in' }, b);
      });

      return () => {
        stage.classList.remove('is-live');
        gsap.set([hero, ...beats], { clearProps: 'all' });
      };
    },
  );

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// as incisões se desenham uma vez, quando o gráfico entra na tela
gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
  gsap.from('#cuts .cut', {
    scaleX: 0, duration: 0.9, ease: 'power2.out', stagger: 0.09,
    scrollTrigger: { trigger: '#cuts', start: 'top 72%', once: true },
  });
});
