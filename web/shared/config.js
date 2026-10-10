export const CONFIG = {
  CESIUM_TOKEN: 'PASTE_ION_TOKEN',          // cesium.com/ion → Access Tokens (keep the repo private)
  CALLSIGN: 'Valkyrie',                      // spoken as "Valkyrie one zero one"
  QR_BASE: 'https://visaguy.ae/',            // or the SourceTag demo page if that gets built
  QR_PARAMS: { utm_source: 'seatback', utm_medium: 'qr', utm_campaign: 'layover2026' }, // + utm_content=<dest>, ref=<flightNo>
  TOD_MIN_BEFORE_ARR: 30,                    // top-of-descent call
  ROUTES: [
    { id: 'CCJ-DXB', flightNo: 'VK101', from: 'CCJ', to: 'DXB', depRwy: '28', arrRwy: '30L', blockMin: 245 },
    { id: 'COK-DXB', flightNo: 'VK202', from: 'COK', to: 'DXB', depRwy: '27', arrRwy: '30L', blockMin: 250 },
  ],
  DEFAULT_ROUTE: 'CCJ-DXB',
};
