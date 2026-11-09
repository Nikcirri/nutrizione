<script lang="ts" module>
  // Icone a tratto disegnate per l'app (24 × 24).
  const PATHS = {
    close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    chevronLeft: 'M15 18l-6-6 6-6',
    chevronRight: 'M9 6l6 6-6 6',
    chevronDown: 'M6 9l6 6 6-6',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
    barcode: 'M3 6V4h3M18 4h3v2M21 18v2h-3M6 20H3v-2M7 8v8M10 8v8M13 8v8M15.5 8v8M17.5 8v8',
    edit: 'M4 20h4L18.5 9.5l-4-4L4 16v4zM13 7l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
    meal: 'M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-3.5 2-3.5 5.5V13H17',
    timer: 'M12 6a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 10v4l2.5 2M9 2h6',
    chart: 'M4 20V13M10 20V9M16 20V5M22 20H2',
    user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6',
    drop: 'M12 3.5c-3 4-6 7.2-6 10.8a6 6 0 0 0 12 0c0-3.6-3-6.8-6-10.8z',
    flame: 'M12 3c.8 3.6 5 5.6 5 10.6a5 5 0 0 1-10 0c0-2.4 1.2-3.8 2.2-5.4.7 1.2 1.6 1.9 2.6 2.1-.3-2.6-.3-4.9.2-7.3z',
    pulse: 'M3 12h4l3-7 4 14 3-7h4',
    steps: 'M8 3c1.7 0 2.5 1.8 2.5 4S9.5 11 8 11 5.5 9.2 5.5 7 6.3 3 8 3zM6 13.5h4V16a2 2 0 0 1-4 0zM16 8c1.7 0 2.5 1.8 2.5 4s-1 4-2.5 4-2.5-1.8-2.5-4S14.3 8 16 8zM14 18.5h4V21h-4z',
    dumbbell: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
    refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5',
    copy: 'M10 8h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM15 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4',
    bolt: 'M13 2L4.5 13.5H11L10 22l8.5-11.5H12z',
    globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9',
    scale: 'M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM8 10a4.5 4.5 0 0 1 8 0M12 10l1.5-2.2',
    heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
    play: 'M8 5l11 7-11 7z',
    stop: 'M7 7h10v10H7z',
    more: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
    leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    apple: 'M12 7.5c-1.5-1-5.5-1.5-6.8 2.2-1.3 3.7.6 9.3 3.6 10.3 1.3.4 2.2-.3 3.2-.3s1.9.7 3.2.3c3-1 4.9-6.6 3.6-10.3C17.5 6 13.5 6.5 12 7.5zM12 7.5c0-2 1-3.5 3-4',
    camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
    image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 2-2 5 5M15.5 8.5v.01',
    sparkles: 'M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z',
    key: 'M8 11a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM10.8 12.2L19 4M16 7l2.5 2.5M14 9l2 2',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8',
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 24, filled = false }: { name: IconName; size?: number; filled?: boolean } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={name === 'more' ? 3 : 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
