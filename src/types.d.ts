// Minimal project-specific ambient declarations (images, chart.js)
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module 'bcryptjs' {
  const anything: any;
  export = anything;
}

declare module 'chart.js' {
  const anything: any;
  export = anything;
}

declare namespace NodeJS {
  interface Global {
    __DEV__?: boolean;
  }
}
