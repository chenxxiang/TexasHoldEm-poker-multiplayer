import { createContext } from "react";
import { io } from "socket.io-client";

const SERVER = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : window.location.origin;

export const socket = io(SERVER);
export const SocketContext = createContext(socket);
