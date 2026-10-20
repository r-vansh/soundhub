// Stand-ins for the bits of the "framer" package GardenHero uses, so the
// component runs as a plain web page outside Framer.
export const RenderTarget = {
    canvas: "CANVAS",
    preview: "PREVIEW",
    current: () => "PREVIEW",
}

export const ControlType = new Proxy({} as Record<string, string>, {
    get: (_, key) => String(key),
})

export function addPropertyControls() {}
