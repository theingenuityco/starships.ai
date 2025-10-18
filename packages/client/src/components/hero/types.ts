export type Palette = 'deep-space'

export type Intensity = 'minimal' | 'expressive' | 'cinematic'

export interface SceneCommonProps {
  palette?: Palette
  intensity?: Intensity
}

export interface SceneWrapperProps extends SceneCommonProps {
  onWarpDone?: () => void
}

export interface SceneImperativeApi {
  triggerWarp: () => void
}
