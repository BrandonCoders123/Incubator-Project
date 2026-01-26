export type Crosshair = {
  id: string;
  name: string;
  type: "dot" | "cross" | "circle";
  size: number;
  thickness?: number;
  gap?: number;
  color: string;
};

export const CROSSHAIRS: Crosshair[] = [
  {
    id: "classic-dot",
    name: "Classic Dot",
    type: "dot",
    size: 4,
    color: "#ffffff"
  },
  {
    id: "large-dot",
    name: "Large Dot",
    type: "dot",
    size: 8,
    color: "#ff5555"
  },
  {
    id: "thin-cross",
    name: "Thin Cross",
    type: "cross",
    size: 10,
    thickness: 1,
    gap: 4,
    color: "#ffffff"
  },
  {
    id: "bold-cross",
    name: "Bold Cross",
    type: "cross",
    size: 14,
    thickness: 3,
    gap: 6,
    color: "#00ff99"
  },
  {
    id: "tight-cross",
    name: "Tight Cross",
    type: "cross",
    size: 8,
    thickness: 2,
    gap: 2,
    color: "#ffff00"
  },
  {
    id: "circle-small",
    name: "Small Circle",
    type: "circle",
    size: 6,
    thickness: 2,
    color: "#ffffff"
  },
  {
    id: "circle-large",
    name: "Large Circle",
    type: "circle",
    size: 12,
    thickness: 3,
    color: "#ff8800"
  },
  {
    id: "minimal-green",
    name: "Minimal Green",
    type: "dot",
    size: 3,
    color: "#00ff00"
  },
  {
    id: "sniper-cross",
    name: "Sniper Cross",
    type: "cross",
    size: 18,
    thickness: 1,
    gap: 10,
    color: "#ff0000"
  },
  {
    id: "training-default",
    name: "Training Default",
    type: "cross",
    size: 12,
    thickness: 2,
    gap: 5,
    color: "#ffffff"
  }
];
