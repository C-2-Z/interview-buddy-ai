# EZMock Design System

## Product character

EZMock is a professional career-training SaaS for job seekers. The interface must feel calm, trustworthy, content-first, and efficient. It must never feel like a children's learning product or a decorative AI demo.

## Foundation

- Light-first career workspace; immersive dark styling is reserved for active voice interviews.
- Primary: recruitment blue `#0369A1`; supporting sky blue `#0EA5E9`; success green `#16A34A`; neutral surfaces use Slate.
- Implement colors through semantic OKLCH tokens in `src/styles.css`. Feature components must not introduce raw brand colors.
- Font stack: `Noto Sans SC`, `Microsoft YaHei UI`, `PingFang SC`, `system-ui`, `sans-serif`. Do not fetch remote fonts.
- Type scale: 12 / 14 / 16 / 18 / 24 / 32. Mobile body copy is at least 16px for form and reading surfaces.
- Spacing follows a 4px base with 8px rhythm. Page sections use 24–48px separation.
- Radius scale: 12px controls, 16px cards, 20px feature surfaces. Shadows are subtle and reserved for elevation.

## Interaction

- One primary action per surface. Destructive actions are spatially separated and require confirmation.
- Touch targets are at least 44×44px with at least 8px separation.
- Motion tokens: fast 180ms, standard 240ms, panel 300ms. Use opacity and transform only.
- Always provide visible keyboard focus. Respect `prefers-reduced-motion`.
- Loading, empty, success, warning, and error states include text and icon; color is never the only signal.

## Responsive and accessibility

- Breakpoints to verify: 375, 390, 768, 1024, and 1440px, plus mobile landscape.
- Use a collapsible sidebar on desktop and a labeled Sheet navigation on mobile.
- Normal text contrast must meet WCAG AA 4.5:1. Large text and non-text UI must meet 3:1.
- Preserve browser back behavior, route deep links, scroll state, and form drafts.

## Anti-patterns

- No emoji as navigation or structural icons.
- No text/voice mode switch inside a session.
- No complete question list or answer editor in the voice room.
- No invented scores, charts, resume metrics, or reference answers.
- No decorative glass effects, excessive gradients, long animations, or hover-only actions.
