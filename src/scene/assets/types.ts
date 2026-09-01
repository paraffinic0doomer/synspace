/** Every asset primitive renders from the accent colour on the scene object. */
export interface AssetProps {
  color: string
  /**
   * The object's display name. Large assets paint it onto their own geometry,
   * so a hospital reads as a hospital from across the room.
   */
  label?: string
}
