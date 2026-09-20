// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

/**
 * The Miso documentation site.
 *
 * `site` is what makes the sitemap and canonical links correct. Change it if
 * the site moves to a different domain, because Astro writes absolute URLs from
 * it at build time and a wrong value is not visible in the pages themselves.
 */
export default defineConfig({
  site: 'https://miso.pinkpixel.dev',
  integrations: [
    starlight({
      title: 'Miso',
      description:
        'A local music generation and remix studio built on audio.cpp. Generate, repaint, split, convert and finish music on your own machine.',
      logo: {
        src: './src/assets/logo.png',
        alt: 'Miso',
        replacesTitle: false,
      },
      favicon: '/favicon.png',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/pinkpixel-dev/miso',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/pinkpixel-dev/miso/edit/main/website/',
      },
      lastUpdated: true,
      // The stock chrome is what makes every Starlight site look like every
      // other Starlight site. These three carry the Miso identity instead.
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        Footer: './src/components/Footer.astro',
        Hero: './src/components/Hero.astro',
      },
      /*
       * Expressive Code's own colours are left alone. They already sit close to
       * this palette, and overriding them with CSS variables breaks the way it
       * resolves theme colours at build time. The only change is in theme.css,
       * which hides the fake terminal titlebar.
       */
      customCss: [
        '@fontsource-variable/space-grotesk',
        '@fontsource-variable/public-sans',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/theme.css',
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What Miso is', slug: 'start/what-miso-is' },
            { label: 'Requirements', slug: 'start/requirements' },
            { label: 'Install', slug: 'start/install' },
            { label: 'Your first song', slug: 'start/first-song' },
            { label: 'Installing models', slug: 'start/models' },
          ],
        },
        {
          label: 'Making music',
          items: [
            { label: 'Projects and takes', slug: 'guides/projects' },
            { label: 'Importing audio', slug: 'guides/importing' },
            { label: 'Generating a track', slug: 'guides/generating' },
            { label: 'The lyrics assistant', slug: 'guides/lyrics-assistant' },
            { label: 'Repainting a section', slug: 'guides/repaint' },
            { label: 'Covers', slug: 'guides/covers' },
            { label: 'Scores with YuE2', slug: 'guides/scores' },
            { label: 'Splitting into stems', slug: 'guides/stems' },
            { label: 'Changing a voice', slug: 'guides/voices' },
            { label: 'Sound effects and MIDI', slug: 'guides/sound' },
            { label: 'Comparing takes', slug: 'guides/compare' },
            { label: 'Audio tools', slug: 'guides/audio-tools' },
            { label: 'Exporting', slug: 'guides/exporting' },
            { label: 'Keyboard shortcuts', slug: 'guides/shortcuts' },
          ],
        },
        {
          label: 'Models',
          items: [
            { label: 'Choosing a model', slug: 'models/choosing' },
            { label: 'ACE-Step 1.5', slug: 'models/ace-step' },
            { label: 'YuE2', slug: 'models/yue2' },
            { label: 'MiniMax Music 3', slug: 'models/minimax' },
            { label: 'HeartMuLa', slug: 'models/heartmula' },
            { label: 'Stable Audio 3', slug: 'models/stable-audio' },
            { label: 'Stem separation', slug: 'models/separation' },
            { label: 'RVC', slug: 'models/rvc' },
            { label: 'Vevo2', slug: 'models/vevo2' },
            { label: 'MuScriptor', slug: 'models/muscriptor' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Stack commands', slug: 'reference/commands' },
            { label: 'Task list', slug: 'reference/tasks' },
            { label: 'Storage and disk', slug: 'reference/storage' },
            { label: 'Architecture', slug: 'reference/architecture' },
            { label: 'HTTP API', slug: 'reference/api' },
            { label: 'Running from source', slug: 'reference/from-source' },
            { label: 'Remote backend', slug: 'reference/remote-backend' },
          ],
        },
        { label: 'Troubleshooting', slug: 'troubleshooting' },
      ],
    }),
  ],
});
