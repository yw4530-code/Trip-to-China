window.tripCities = [
  {
    id: "shanghai",
    name: "Shanghai",
    chineseName: "上海",
    latitude: 31.2304,
    longitude: 121.4737,
    sequence: [1, 5],
    detailZoom: 11,
    detailBounds: [
      [31.205, 121.448],
      [31.248, 121.505]
    ],
    description: "Arrival city, return city, and the anchor point for both the first jet-lag reset and the last shopping-heavy days before flying back to New York.",
    stays: [
      {
        label: "Arrival stay",
        arrivalDate: "2026-08-11",
        arrivalTime: "3:00 PM",
        departureDate: "2026-08-12",
        departureNote: "Travel to Jinan by high-speed train."
      },
      {
        label: "Return stay",
        arrivalDate: "2026-08-22",
        departureDate: "2026-08-26",
        departureNote: "Final departure to New York on August 26."
      }
    ],
    specialSegments: [
      {
        direction: "outbound",
        label: "Shanghai to New York",
        date: "2026-08-26",
        mode: "flight",
        estimatedDuration: "International flight",
        status: "Planning",
        note: "Not drawn on the China map."
      }
    ]
  },
  {
    id: "jinan",
    name: "Jinan",
    chineseName: "济南",
    latitude: 36.6512,
    longitude: 117.1201,
    sequence: [2],
    detailZoom: 11,
    detailBounds: [
      [36.63, 116.99],
      [36.69, 117.16]
    ],
    description: "A shorter stop focused on classic spring and lake scenery before moving north to Beijing.",
    stays: [
      {
        label: "City stay",
        arrivalDate: "2026-08-12",
        departureDate: "2026-08-15",
        departureNote: "Travel onward to Beijing by high-speed train."
      }
    ],
    specialSegments: []
  },
  {
    id: "beijing",
    name: "Beijing",
    chineseName: "北京",
    latitude: 39.9042,
    longitude: 116.4074,
    sequence: [3],
    detailZoom: 10,
    detailBounds: [
      [39.84, 116.22],
      [40.46, 116.62]
    ],
    description: "The history-heavy segment of the trip, mixing palace complexes, ritual architecture, and a half-day Great Wall outing.",
    stays: [
      {
        label: "City stay",
        arrivalDate: "2026-08-15",
        departureDate: "2026-08-19",
        departureNote: "Flight onward to the temporary Yunnan stop."
      }
    ],
    specialSegments: []
  },
  {
    id: "yunnan-temp",
    name: "Yunnan",
    chineseName: "云南",
    latitude: 25.0389,
    longitude: 102.7183,
    sequence: [4],
    detailZoom: 11,
    detailBounds: [
      [24.94, 102.62],
      [25.08, 102.76]
    ],
    description: "Temporary placeholder set to Kunming so the prototype can already model the southwest leg, city zoom, and sample landmarks before the final destination is chosen.",
    subtitle: "Temporary location: Kunming",
    isTemporary: true,
    replacementOptions: ["Kunming", "Dali", "Lijiang", "Guilin"],
    stays: [
      {
        label: "Temporary stay",
        arrivalDate: "2026-08-19",
        departureDate: "2026-08-22",
        departureNote: "Flight back to Shanghai."
      }
    ],
    specialSegments: []
  }
];
