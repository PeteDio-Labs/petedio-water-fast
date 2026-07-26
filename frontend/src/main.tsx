import { render } from "preact";
import { App } from "./app/App.tsx";
import { httpBackend } from "./lib/api.ts";
import "./styles/tokens.css";
import "./styles/app.css";

render(<App backend={httpBackend} />, document.getElementById("app")!);
