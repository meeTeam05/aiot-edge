import { homeApi } from '../api/homeApi';

/** Service boundary retained for parity with Flutter's DeviceService and HomeService. */
export const homeDataService = {
  getDevices: homeApi.listDevices,
  getHomes: homeApi.listHomes,
  getRooms: homeApi.listRooms,
  createHome: homeApi.createHome,
  updateHome: homeApi.updateHome,
  deleteHome: homeApi.deleteHome,
};
