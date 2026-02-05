# Mobile Readiness Plan for MarlApps

---
## IMPLEMENTATION PROGRESS

### Completed
- [x] **Phase 1.1**: Mobile bottom navigation bar (HTML, CSS, JS)
- [x] **Phase 1.2**: Mobile search overlay (full implementation)
- [x] **Phase 1.3**: Mobile categories sheet (bottom sheet pattern)
- [x] **Phase 2.1**: Safe area insets (env() for notches/home indicators)
- [x] **Phase 2.2**: Minimum touch targets (72px on mobile for cards)
- [x] **Phase 3.1**: Momentum scrolling for recents (-webkit-overflow-scrolling)
- [x] **Phase 3.2**: Hide mobile nav when app is open
- [x] **Phase 4.1**: App workspace fixed positioning on mobile
- [x] **Phase 4.2**: Landscape orientation handling (compact nav, adjusted heights)
- [x] **Phase 4.3**: Settings close resets mobile nav state

### In Progress
- [ ] **Phase 5**: Individual app audits (touch, drag-drop, inputs)

### Not Started
- [ ] **Phase 6**: PWA enhancements (add to home screen prompt, offline)

### Files Modified
- `index.html` - Added mobile nav, search overlay, categories sheet HTML
- `launcher/launcher.css` - Added all mobile CSS (~250 lines, including landscape)
- `launcher/launcher.js` - Added mobile event handlers (~200 lines)
- `launcher/settings.js` - Added settingsClosed event dispatch
- `service-worker.js` - Cache bumped to v15

### To Resume Implementation
1. Test current mobile implementation on actual devices
2. Audit individual apps for touch/mobile compatibility
3. Add PWA install prompt
4. Test offline functionality

---

## Current State Analysis

### What's Already in Place
- Viewport meta tag configured correctly (`width=device-width, initial-scale=1.0`)
- PWA manifest with mobile app capabilities
- Apple mobile web app meta tags
- Basic responsive breakpoint at 768px that:
  - Hides sidebar
  - Makes grid single column
  - Hides search keyboard hint
  - Makes settings drawer full-width
- Individual apps have some media queries for mobile

### Current Issues
1. **No mobile navigation** - Sidebar is hidden but no alternative provided
2. **Touch targets may be too small** - Minimum recommended is 44x44px
3. **No safe area handling** - For devices with notches/home indicators
4. **Search bar may be awkward on mobile** - Takes up space, keyboard hint hidden
5. **No swipe gestures** - Common mobile UX pattern missing
6. **Apps iframe may have scroll issues** - Nested scrolling on mobile is problematic
7. **Font sizes may be too small** - Need to verify readability
8. **No landscape orientation handling**

---

## Phase 1: Launcher Mobile Navigation

### 1.1 Add Mobile Bottom Navigation Bar
Create a bottom navigation bar that appears on mobile (below 768px) with:
- Home (All Apps)
- Categories (expandable)
- Search (toggles search overlay)
- Settings

**Files to modify:**
- `index.html` - Add bottom nav HTML structure
- `launcher/launcher.css` - Add bottom nav styles
- `launcher/launcher.js` - Add bottom nav event handlers

**CSS Changes:**
```css
/* Mobile bottom navigation */
.mobile-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface-tertiary);
  border-top: 1px solid var(--border-secondary);
  z-index: 100;
}

@media (max-width: 768px) {
  .mobile-nav {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }

  .main-content {
    padding-bottom: calc(64px + env(safe-area-inset-bottom));
  }
}
```

### 1.2 Mobile Search Overlay
Instead of inline search, create a full-screen search overlay on mobile:
- Triggered from bottom nav search button
- Full-screen with large input
- Results displayed below
- Easy dismiss with X or swipe down

---

## Phase 2: Safe Areas & Touch Targets

### 2.1 Add Safe Area Insets
Update CSS to respect device safe areas (notches, home indicators):

**Files to modify:**
- `launcher/launcher.css`
- `themes/tokens.css`

```css
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
  --safe-area-left: env(safe-area-inset-left);
  --safe-area-right: env(safe-area-inset-right);
}

.topbar {
  padding-top: var(--safe-area-top);
  height: calc(var(--topbar-height) + var(--safe-area-top));
}
```

### 2.2 Ensure Minimum Touch Targets
Audit and update all interactive elements to be at least 44x44px:
- Nav items
- App cards
- Buttons
- Settings controls

---

## Phase 3: Mobile-Optimized Components

### 3.1 Recents Section
- Make horizontally scrollable with momentum
- Add scroll snap for card-by-card scrolling
- Ensure touch-friendly sizing

### 3.2 App Grid
- Single column on mobile (already done)
- Larger touch targets
- Pull-to-refresh capability (optional)

### 3.3 Settings Drawer
- Slide up from bottom on mobile (sheet pattern)
- Or keep as full-screen overlay
- Larger touch targets for controls

---

## Phase 4: App Workspace Mobile Optimization

### 4.1 Iframe Handling
- Ensure apps are fully visible without nested scroll issues
- Consider using `overflow: hidden` on body when app is open
- Test each app's responsiveness within iframe

### 4.2 App Return Navigation
- Home button in topbar works well
- Consider adding swipe-from-left gesture to return
- Ensure topbar is always visible when app is open

---

## Phase 5: Individual App Audits

Each app needs to be verified for mobile readiness:

### 5.1 Pomodoro Timer
- [x] Has mobile breakpoints
- [ ] Verify touch controls work
- [ ] Test notifications on mobile

### 5.2 Kanban Board
- [x] Has mobile breakpoints
- [ ] Verify drag-and-drop works on touch
- [ ] May need touch-specific drag implementation

### 5.3 Todo List
- [x] Has mobile breakpoints
- [ ] Verify checkbox touch targets
- [ ] Test swipe-to-delete if implemented

### 5.4 Notes
- [x] Has mobile breakpoints
- [ ] Verify text input works well
- [ ] Test scrolling within notes

### 5.5 Habits
- [x] Has mobile breakpoints
- [ ] Verify habit toggle touch targets
- [ ] Test calendar navigation

### 5.6 Mirror
- [x] Has mobile breakpoints
- [ ] Verify camera permissions work on mobile
- [ ] Test capture functionality

---

## Phase 6: Performance & PWA Enhancements

### 6.1 Performance
- Lazy load app icons
- Optimize CSS for mobile (reduce unused styles)
- Consider code splitting for apps

### 6.2 PWA Features
- Add "Add to Home Screen" prompt
- Ensure offline functionality works
- Test service worker caching on mobile

---

## Implementation Priority

### High Priority (Do First)
1. Mobile bottom navigation bar
2. Safe area insets
3. Touch target sizing audit
4. App workspace scroll handling

### Medium Priority
5. Mobile search overlay
6. Settings sheet pattern
7. Swipe gestures

### Lower Priority (Polish)
8. Individual app touch audits
9. PWA enhancements
10. Performance optimizations

---

## Testing Checklist

### Devices to Test
- [ ] iPhone SE (small screen)
- [ ] iPhone 14/15 (notch)
- [ ] iPhone 14/15 Pro Max (large screen + dynamic island)
- [ ] Android phone (various sizes)
- [ ] iPad / Android tablet

### Test Scenarios
- [ ] Launch app from home screen (PWA)
- [ ] Navigate between categories
- [ ] Search for apps
- [ ] Open and use each app
- [ ] Access settings
- [ ] Switch themes
- [ ] Landscape orientation
- [ ] Split-screen / multitasking

---

## Estimated Scope

| Phase | Effort | Files Changed |
|-------|--------|---------------|
| Phase 1 | Medium | 3 |
| Phase 2 | Small | 2 |
| Phase 3 | Medium | 2 |
| Phase 4 | Small | 2 |
| Phase 5 | Large | 6 app CSS files |
| Phase 6 | Medium | Various |

---

## Notes

- The launcher already has a good foundation with CSS custom properties
- Most changes will be additive (new mobile-specific styles)
- Individual apps may need the most work depending on their current state
- Consider using a CSS framework's mobile utilities or keeping custom
