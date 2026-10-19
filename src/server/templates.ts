export type ItemTemplate = { name: string; isEquipment: boolean };
export type RoomTemplate = { key: string; name: string; items: ItemTemplate[] };

const surfaces: ItemTemplate[] = [
  { name: "Walls", isEquipment: false },
  { name: "Ceiling", isEquipment: false },
  { name: "Floor", isEquipment: false },
  { name: "Door", isEquipment: false },
  { name: "Windows", isEquipment: false },
  { name: "Light fixtures", isEquipment: true },
  { name: "Outlets / switches", isEquipment: true },
];

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    key: "kitchen",
    name: "Kitchen",
    items: [
      ...surfaces,
      { name: "Stove / oven", isEquipment: true },
      { name: "Refrigerator", isEquipment: true },
      { name: "Dishwasher", isEquipment: true },
      { name: "Microwave", isEquipment: true },
      { name: "Sink and faucet", isEquipment: true },
      { name: "Cabinets", isEquipment: false },
      { name: "Countertops", isEquipment: false },
    ],
  },
  {
    key: "bathroom",
    name: "Bathroom",
    items: [
      ...surfaces,
      { name: "Toilet", isEquipment: true },
      { name: "Sink and faucet", isEquipment: true },
      { name: "Shower / tub", isEquipment: true },
      { name: "Exhaust fan", isEquipment: true },
      { name: "Mirror / vanity", isEquipment: false },
    ],
  },
  {
    key: "bedroom",
    name: "Bedroom",
    items: [...surfaces, { name: "Closet", isEquipment: false }, { name: "Smoke detector", isEquipment: true }],
  },
  {
    key: "living",
    name: "Living Room",
    items: [...surfaces, { name: "Heating / AC unit", isEquipment: true }, { name: "Smoke detector", isEquipment: true }],
  },
  { key: "dining", name: "Dining Room", items: surfaces },
  {
    key: "laundry",
    name: "Laundry",
    items: [...surfaces, { name: "Washer", isEquipment: true }, { name: "Dryer", isEquipment: true }],
  },
  { key: "exterior", name: "Exterior / Entry", items: [...surfaces, { name: "Front door lock", isEquipment: true }] },
];

export function getTemplate(key: string) {
  return ROOM_TEMPLATES.find((t) => t.key === key);
}
