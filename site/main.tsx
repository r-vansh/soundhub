import * as React from "react"
import { createRoot } from "react-dom/client"
import GardenHero from "../garden-sound-pad/GardenHero"

createRoot(document.getElementById("root")!).render(<GardenHero ambient />)
