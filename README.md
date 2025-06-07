<div class="title-block" style="text-align: center;" align="center">

# YGO Draft
<p><img title="ygo draft logo" src="static/favicon.svg" height="200" ></p>

</div>

A web application for creating and participating in custom Yu-Gi-Oh! card drafts with your friends. Upload your cube, configure your draft settings, and draft cards in real-time.

## Features

- **Custom Cubes**: Upload your Yu-Gi-Oh! cube in CSV format
- **Multiple Draft Formats**: Support for Winston Draft and Rochester Draft
- **Pack Rarity Customisation**: Choose how many cards of each rarity are in a pack
- **Custom Card Rarities**: You choose how rare each card should be, or just use the Master Duel rarities.
- **Real-time Drafting**: Draft cards with friends with real-time updates
- **Card Visualisation**: View your drafted deck with card images and statistics
- **YDK Export**: Download your drafted deck in YDK format for use in simulators
- **Draft Statistics**: Analyse your draft with built-in charts and analytics

## Getting Started

### Prerequisites

- Node.js (v18.x or later)
- pnpm package manager

### Installation

1. Clone the repository
```bash
git clone https://github.com/a-ws-m/ygo-draft.git
cd ygo-draft
```

2. Install dependencies
```bash
pnpm install
```

3. Set up your environment variables
```bash
cp .env.example .env
```

4. Update the .env file with your Supabase credentials

5. Start the development server
```bash
pnpm dev
```

## Usage

### Creating a Draft

1. Visit the home page
2. Upload your cube CSV file (you can create one at [YGOProdeck Cube Builder](https://ygoprodeck.com/cube/))
3. Configure your draft settings:
   - Select a draft method (Winston, Rochester or Grid)
   - Set the number of players
   - Configure additional settings based on the draft method
4. Start the draft and share the URL with other players

### Participating in a Draft

1. Open the shared draft URL
2. Wait for all players to join
3. The draft creator will start the draft when everyone is ready
4. Follow the on-screen instructions to draft cards based on the selected method

## Draft Methods

### Winston Draft

In Winston Draft, cards are arranged into piles. On your turn:
1. Look at the first pile
2. Choose to either take that pile or pass to the next pile
3. If you pass on all piles, you must take a card from the top of the pool deck
4. After your selection, add a card from the deck to each pile you passed

### Rochester Draft

In Rochester Draft:
1. Cards are laid out face up in "packs"
2. Players take turns selecting one card at a time from the available pack
3. The direction of picking reverses each round
4. When a pack is empty, a new one is opened

### Grid Draft

In Grid Draft:
1. Cards are arranged face up in a grid (Default is 3×3)
2. Players take turns to select a row/column of the grid, adding those cards to their drafted deck
3. Replenish rows/columns with new cards from the pool
4. Continue until each player has desired number of cards

### Asynchronous Draft

In Asynchronous Draft:
1. Players draft independently at their own pace without needing to coordinate schedules
2. Each player opens their own packs and selects cards
3. Once a card is drafted by a player, it's no longer available to others (unless you enable `Allow overlap in player packs`)
4. Players can join and make picks whenever they have time
5. Draft continues until all players have completed their selections

## Technologies

- [Svelte](https://svelte.dev/) and [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Supabase](https://supabase.com/) - Backend, database, and real-time functionality
- [ChartJS](https://www.chartjs.org) - Data visualization
- [PapaParse](https://www.papaparse.com/) - CSV parsing
- [Fuzzy-search](https://github.com/wouterrutgers/fuzzy-search) - Fuzzy searching for card names/descriptions
- [Feather icons](https://feathericons.com/) - Beautiful, open source icons
- [Swiper](https://swiperjs.com/) - Card carousel display
- [TippyJS](https://atomiks.github.io/tippyjs/) - Fancy tooltips

## Contributing

We welcome contributions to YGO Draft! Please check out our contributing guidelines for details on how to get started.

For bug reports and feature requests, please [open an issue](https://github.com/a-ws-m/ygo-draft/issues) on GitHub.


## Changelog

- [19/05/2025] I have disabled sign in with OAuth for now as there is no advantage to doing this compared to signing in anonymously. I want to avoid storing any user data until it becomes necessary to do that for some functionality (e.g. saving your own cubes). If you previously signed in with your Discord/GitHub account, your data has been deleted from Supabase.

## License

This project is licensed under the AGPLv3 License - see the LICENSE file for details.

## Acknowledgments

- [YGOProdeck](https://ygoprodeck.com/) for their card database and cube builder
- Skully and Retrorage for the default cubes.
- All contributors and players who have helped test and improve this application

---

Created by [a-ws-m](https://github.com/a-ws-m)