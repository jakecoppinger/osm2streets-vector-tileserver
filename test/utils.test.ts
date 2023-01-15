import { TileCoordinate } from '../src/interfaces';
import { calculateTileCoordsForZoom } from '../src/utils';

describe('calculateTileCoordsForZoom', () => {
  it('should return same value when same zoom', () => {
    const input: TileCoordinate = {zoom :17, x:120587, y: 78648};
    const expectedOutput: TileCoordinate = {zoom :17, x:120587, y: 78648};
    const actualOutput  = calculateTileCoordsForZoom(input, input.zoom);
    expect(actualOutput).toStrictEqual(expectedOutput);
  });
  it('should zoom out one level correctly', () => {
    const input: TileCoordinate = {zoom :17, x:120587, y: 78648};
    const expectedOutput: TileCoordinate = {zoom :16, x:60293, y: 39324};
    const actualOutput  = calculateTileCoordsForZoom(input, 16);
    expect(actualOutput).toStrictEqual(expectedOutput);
  });
  it('should zoom return null when target zoom is larger than input', () => {
    const input: TileCoordinate = {zoom :17, x:120587, y: 78648};
    const actualOutput  = calculateTileCoordsForZoom(input, 18);
    expect(actualOutput).toStrictEqual(null);
  });

});