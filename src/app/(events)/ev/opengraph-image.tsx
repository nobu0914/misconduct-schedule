import { OG_SIZE, eventsOgImage } from "@/components/events/ogImage";

export const alt = "Rinnavi Events";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return eventsOgImage({ title: "ホッケーの練習会・イベント", sub: "練習会・体験会・大会のお知らせ" });
}
