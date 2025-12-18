// Mock Google Sheets Service
// In a real app, this would use googleapis to sync data

export const sheets = {
  appendRow: async (spreadsheetId: string, range: string, values: any[]) => {
    console.log(`[Sheets] Appending to ${spreadsheetId} range ${range}:`, values);
    return { updates: { updatedCells: values.length } };
  },
  readRange: async (spreadsheetId: string, range: string) => {
    console.log(`[Sheets] Reading from ${spreadsheetId} range ${range}`);
    return { values: [] };
  }
};
