/**
 * Additional, purchasable gift formats tied to already verified Qloo entities.
 * Prices are editorial estimates; retailer search links let shoppers verify
 * the current edition, price and availability before buying.
 */
export interface CuratedGiftEntry {
  id: string;
  title: string;
  brand: string;
  price: number;
  category: string;
  entityRef: string;
  description: string;
  image?: string;
  buyUrl?: string;
}

type GiftRow = [id: string, title: string, brand: string, price: number, category: string, entityRef: string, description: string, image?: string];

const entries: GiftRow[] = [
  ["cur-in-rainbows", "In Rainbows · vinyl LP", "Radiohead", 32, "Vinyl", "tp-002", "Warm, intricate art rock, made for listening to an entire side at a time.", "/images/in-rainbows.jpg"],
  ["cur-vespertine", "Vespertine · double vinyl", "Björk", 38, "Vinyl", "tp-019", "Music-box textures, microbeats and choral warmth in a beautifully tactile format.", "/images/vespertine.jpg"],
  ["cur-random-access", "Random Access Memories · 2LP", "Daft Punk", 38, "Vinyl", "tp-022", "A love letter to the craft of recording, with room-filling analogue detail.", "/images/random-access.jpg"],
  ["cur-kind-of-blue", "Kind of Blue · vinyl LP", "Miles Davis", 26, "Vinyl", "tp-024", "The spacious, unhurried jazz record that rewards a quiet evening.", "/images/kind-of-blue.jpg"],
  ["cur-async", "async · double vinyl", "Ryuichi Sakamoto", 42, "Vinyl", "tp-051", "Piano, environmental sound and silence, for someone who notices the small details.", "/images/async.jpg"],
  ["cur-homogenic", "Homogenic · vinyl LP", "Björk", 30, "Vinyl", "tp-019", "Strings and electronic percussion with a distinctly cinematic scale."],
  ["cur-ok-computer", "OK Computer · double vinyl", "Radiohead", 38, "Vinyl", "tp-002", "An expansive, intricately produced album for the thoughtful record collector."],
  ["cur-igor", "IGOR · vinyl LP", "Tyler, the Creator", 30, "Vinyl", "tp-004", "A carefully sequenced, pastel-toned world of soul, synths and character."],
  ["cur-to-pimp", "To Pimp a Butterfly · 2LP", "Kendrick Lamar", 36, "Vinyl", "tp-023", "Jazz, poetry and hip-hop meet in a densely layered listening experience."],
  ["cur-rumours", "Rumours · vinyl LP", "Fleetwood Mac", 28, "Vinyl", "tp-065", "A familiar favourite with the warmth and presence of a physical record."],
  ["cur-blue", "Blue · vinyl LP", "Joni Mitchell", 28, "Vinyl", "tp-071", "Intimate songwriting for the person who keeps returning to the lyrics."],
  ["cur-dummy", "Dummy · vinyl LP", "Portishead", 32, "Vinyl", "tp-055", "Nocturnal trip-hop, cinematic samples and beautifully restrained production."],
  ["cur-ambient", "Selected Ambient Works 85–92 · 2LP", "Aphex Twin", 38, "Vinyl", "tp-056", "An atmospheric electronic record that turns a room into a listening space."],
  ["cur-currents", "Currents · double vinyl", "Tame Impala", 35, "Vinyl", "tp-090", "Psychedelic pop with a meticulous visual and sonic identity."],
  ["cur-sos", "SOS · double vinyl", "SZA", 36, "Vinyl", "tp-087", "A genre-crossing collection for an emotionally attuned R&B listener."],
  ["cur-back-to-black", "Back to Black · vinyl LP", "Amy Winehouse", 28, "Vinyl", "tp-085", "Vintage soul production and a voice with unmistakable character."],
  ["cur-love-supreme", "A Love Supreme · vinyl LP", "John Coltrane", 30, "Vinyl", "tp-073", "A concentrated jazz statement for a curious, deep listener."],
  ["cur-bowie", "The Rise and Fall of Ziggy Stardust · LP", "David Bowie", 30, "Vinyl", "tp-079", "A whole imagined world, where music, fashion and storytelling meet."],
  ["cur-abbey-road", "Abbey Road · vinyl LP", "The Beatles", 32, "Vinyl", "tp-001", "A studio-crafted classic with an instantly recognisable sleeve."],
  ["cur-hisaishi", "A Symphonic Celebration · 2LP", "Joe Hisaishi", 42, "Vinyl", "tp-050", "Orchestral interpretations of the music behind Hayao Miyazaki's films."],
  ["cur-ghibli-piano", "Studio Ghibli piano collection", "Joe Hisaishi", 24, "Reading", "tp-050", "Printed arrangements that turn a love of the films into a creative ritual."],
  ["cur-belle", "If You're Feeling Sinister · LP", "Belle and Sebastian", 27, "Vinyl", "tp-061", "Bookish, observant indie pop with the intimacy of a short story."],
  ["cur-lauryn", "The Miseducation of Lauryn Hill · 2LP", "Lauryn Hill", 34, "Vinyl", "tp-070", "Soul, hip-hop and personal storytelling on two records."],
  ["cur-disco", "Discovery · double vinyl", "Daft Punk", 36, "Vinyl", "tp-082", "Playful, sample-rich dance music with an animated sci-fi sensibility."],
  ["cur-perfect-days", "Perfect Days · Criterion Blu-ray", "The Criterion Collection", 30, "Cinema", "tp-032", "Wim Wenders finds beauty in daily rituals, music and the light through trees."],
  ["cur-mood-love", "In the Mood for Love · Criterion Blu-ray", "The Criterion Collection", 30, "Cinema", "tp-007", "Wong Kar-wai's exquisitely composed story of longing, restored for a home library."],
  ["cur-chungking", "Chungking Express · Blu-ray", "Wong Kar-wai", 30, "Cinema", "tp-049", "Neon, pop songs and fleeting connections in a kinetic Hong Kong love story."],
  ["cur-seven-samurai", "Seven Samurai · Criterion Blu-ray", "The Criterion Collection", 30, "Cinema", "tp-034", "Kurosawa's human-scale epic, with material to explore beyond the film."],
  ["cur-past-lives", "Past Lives · Blu-ray", "A24", 25, "Cinema", "tp-033", "A quiet, carefully observed film about the lives we live and the ones we imagine."],
  ["cur-spirited", "Spirited Away · Blu-ray", "Studio Ghibli", 24, "Cinema", "tp-005", "Miyazaki's hand-drawn world of bathhouses, spirits and growing up."],
  ["cur-totoro", "My Neighbor Totoro · Blu-ray", "Studio Ghibli", 24, "Cinema", "tp-017", "A gentle film about childhood curiosity and the life in an ordinary landscape."],
  ["cur-mononoke", "Princess Mononoke · Blu-ray", "Studio Ghibli", 25, "Cinema", "tp-102", "An intricate, morally curious adventure about people and the natural world."],
  ["cur-akira", "Akira · 4K UHD", "Katsuhiro Otomo", 32, "Cinema", "tp-100", "A landmark of hand-drawn animation for a collector of detailed future worlds."],
  ["cur-ghost", "Ghost in the Shell · 4K UHD", "Mamoru Oshii", 28, "Cinema", "tp-052", "Rain-soaked cyberpunk, identity and an unforgettable choral score."],
  ["cur-paprika", "Paprika · Blu-ray", "Satoshi Kon", 24, "Cinema", "tp-053", "Dream logic and dazzling animation for someone drawn to imaginative cinema."],
  ["cur-blade", "Blade Runner 2049 · 4K UHD", "Denis Villeneuve", 28, "Cinema", "tp-092", "Immersive production design and patient, atmospheric science fiction."],
  ["cur-parasite", "Parasite · Criterion Blu-ray", "The Criterion Collection", 30, "Cinema", "tp-097", "Bong Joon-ho's precise, darkly funny film, with contextual extras."],
  ["cur-budapest", "The Grand Budapest Hotel · Criterion", "The Criterion Collection", 30, "Cinema", "tp-104", "A collector's edition for someone who loves stories told through design."],
  ["cur-eeaao", "Everything Everywhere All at Once · 4K", "A24", 28, "Cinema", "tp-006", "A maximalist family story with room for tenderness and absurdity."],
  ["cur-interstellar", "Interstellar · 4K UHD", "Christopher Nolan", 25, "Cinema", "tp-109", "Large-scale science fiction built around an intimate human story."],
  ["cur-kiki-art", "The Art of Kiki's Delivery Service", "VIZ Media", 32, "Reading", "tp-059", "Background paintings, concept sketches and the craft behind a favourite Ghibli film."],
  ["cur-spirited-art", "The Art of Spirited Away", "VIZ Media", 35, "Reading", "tp-005", "A generous view of Miyazaki's visual worldbuilding, from sketch to finished frame."],
  ["cur-totoro-art", "The Art of My Neighbor Totoro", "VIZ Media", 35, "Reading", "tp-017", "Softly observed landscapes, character drawings and the film's visual development."],
  ["cur-dune-art", "The Art and Soul of Dune", "Insight Editions", 45, "Reading", "tp-096", "Costumes, architecture and landscapes from the making of Villeneuve's Dune."],
  ["cur-blade-art", "The Art and Soul of Blade Runner 2049", "Titan Books", 45, "Reading", "tp-092", "Explore the colour, architecture and objects that build a believable future."],
  ["cur-ghibli-cards", "Studio Ghibli: 100 Collectible Postcards", "Chronicle Books", 22, "Stationery", "tp-005", "One hundred miniature pieces of animation art to send, frame or keep."],
  ["cur-totoro-journal", "My Neighbor Totoro journal", "Chronicle Books", 17, "Stationery", "tp-017", "A small everyday object for a person who loves the gentler side of Ghibli."],
  ["cur-kiki-puzzle", "Kiki's Delivery Service jigsaw puzzle", "Studio Ghibli", 28, "Creative Kits", "tp-059", "A screen-free evening spent inside a familiar animated world."],
  ["cur-totoro-puzzle", "My Neighbor Totoro jigsaw puzzle", "Studio Ghibli", 28, "Creative Kits", "tp-017", "A tactile, quietly absorbing activity for a fan of imaginative worlds."],
  ["cur-lego-bonsai", "Bonsai Tree building set", "LEGO", 50, "Creative Kits", "tp-156", "A small design project with interchangeable foliage and a place on the shelf."],
  ["cur-lego-orchid", "Orchid building set", "LEGO", 50, "Creative Kits", "tp-156", "Build a sculptural botanical object together, then keep it on display."],
  ["cur-lego-flowers", "Tiny Plants building set", "LEGO", 50, "Creative Kits", "tp-156", "Nine small plants, each a satisfying little project."],
  ["cur-moleskine-art", "Art sketchbook · A5", "Moleskine", 26, "Stationery", "tp-012", "A portable space for drawing, visual notes and collecting ideas."],
  ["cur-moleskine-water", "Watercolour notebook", "Moleskine", 28, "Stationery", "tp-012", "Heavy paper for someone who likes to capture places and moments by hand."],
  ["cur-muji-pens", "Gel ink pen set · 10 colours", "MUJI", 16, "Stationery", "tp-011", "A useful little palette for notes, journaling and everyday drawing."],
  ["cur-muji-notes", "Recycled paper notebooks · set of five", "MUJI", 9, "Stationery", "tp-011", "Simple, practical notebooks that make a thoughtful addition to a reading gift."],
  ["cur-muji-aroma", "Ultrasonic aroma diffuser", "MUJI", 70, "Home", "tp-011", "Quiet light and a considered shape for an uncluttered room."],
  ["cur-muji-linen", "Linen cushion cover", "MUJI", 25, "Home", "tp-011", "Natural texture and restrained design for a softer everyday space."],
  ["cur-muji-teapot", "Porcelain teapot", "MUJI", 28, "Tea", "tp-011", "A simple, useful object for a person who enjoys a deliberate daily ritual."],
  ["cur-muji-bowl", "Porcelain rice bowls · pair", "MUJI", 18, "Kitchen", "tp-011", "Everyday Japanese tableware with an understated form."],
  ["cur-muji-chopsticks", "Wooden chopsticks · gift set", "MUJI", 12, "Kitchen", "tp-011", "A small, tactile addition to a Japanese cinema or cooking-themed bundle."],
  ["cur-aesop-hand", "Resurrection hand balm · 75ml", "Aesop", 33, "Beauty", "tp-149", "A useful design-minded gift with a distinctive herbaceous scent."],
  ["cur-diptyque-mini", "Baies small candle · 70g", "Diptyque", 45, "Home", "tp-150", "A small atmospheric object for an evening of reading or listening."],
  ["cur-lelabo-hand", "Hinoki hand pomade", "Le Labo", 33, "Beauty", "tp-151", "A quietly woody scent in an everyday object."],
  ["cur-yeti-mug", "Rambler insulated mug · 14oz", "YETI", 30, "Outdoors", "tp-155", "A durable mug that works as well at a desk as on a camping trip."],
  ["cur-patagonia-bag", "Ultralight Black Hole mini hip pack", "Patagonia", 35, "Outdoors", "tp-147", "A compact, practical companion for the person who takes the long way home."],
  ["cur-kodak-film", "Gold 200 35mm film · 3-pack", "Kodak", 30, "Photography", "tp-039", "Warm colour film that makes a walk feel like a small creative project."],
  ["cur-polaroid-film", "Colour i-Type instant film", "Polaroid", 20, "Photography", "tp-038", "Eight tangible moments for someone who already has an i-Type camera."],
  ["cur-instax-film", "Instax Mini colour film · 20 shots", "Fujifilm", 18, "Photography", "tp-143", "A useful refill for an Instax Mini owner who gives their photos away."],
  ["cur-at-brush", "Anti-static record-cleaning brush", "Audio-Technica", 22, "Audio Gear", "tp-137", "A practical companion to a vinyl gift for an existing turntable owner."],
  ["cur-sony-headphones", "MDR-7506 studio headphones", "Sony", 100, "Audio Gear", "tp-141", "A long-standing studio design for close, detailed listening."],
  ["cur-blue-coffee", "Three Africas coffee beans", "Blue Bottle Coffee", 22, "Coffee", "tp-013", "A considered bag of coffee to accompany a record or a good book."],
  ["cur-blue-dripper", "Coffee dripper", "Blue Bottle Coffee", 25, "Coffee", "tp-013", "Make the morning pour-over feel like part of the gift."],
  ["cur-twinings-box", "Tea selection gift box", "Twinings", 24, "Tea", "tp-160", "A variety of teas for slow evenings and finding a new favourite."],
  ["cur-mubi-gift", "MUBI gift subscription · 3 months", "MUBI", 45, "Experiences", "tp-057", "A continuing invitation to discover thoughtfully curated international cinema."],
  ["cur-hades-art", "Hades: official art print", "Supergiant Games", 25, "Art Print", "tp-016", "Distinctive character art for someone drawn to the game's mythology and illustration."],
  ["cur-stardew-guide", "Stardew Valley guidebook", "Fangamer", 32, "Reading", "tp-036", "A beautifully illustrated, physical companion to a favourite cosy game."],
  ["cur-hollow-pin", "Hollow Knight enamel pin", "Fangamer", 14, "Collectible", "tp-161", "A small, wearable reminder of an atmospheric illustrated world."],
  ["cur-celeste-soundtrack", "Celeste original soundtrack · vinyl", "Lena Raine", 42, "Vinyl", "tp-037", "A game soundtrack that moves between intimate piano and bright electronics."],
  ["cur-zelda-art", "The Legend of Zelda: Art & Artifacts", "Dark Horse Books", 36, "Reading", "tp-167", "A visual archive for a player who notices worldbuilding and character design."],
];

export const curatedGifts: CuratedGiftEntry[] = entries.map(([id, title, brand, price, category, entityRef, description, image]) => ({
  id, title, brand, price, category, entityRef, description, image,
  buyUrl: id === "cur-mubi-gift" ? "https://mubi.com/en/gifts" : undefined,
}));
