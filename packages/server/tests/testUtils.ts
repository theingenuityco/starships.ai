import request from "supertest";
import { app } from "../src/index";

export const api = () => request(app); 