// Function to fetch and display data from Google Sheets API
function fetchData(sheetId, tabName, containerId) {
    const apiKey = 'AIzaSyDh_M4gUwsZV3n9qqkPGOExG4DvOvnFH2g'; // Replace with your API key
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabName}?key=${apiKey}`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            const values = data.values;
            const container = document.getElementById(containerId);
            let table = container.querySelector('table');

            // If the table doesn't exist, create a new one
            if (!table) {
                table = document.createElement('table');
                container.appendChild(table);
            }

            // Update the table without changing row sizes
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            // Optionally, refresh the page on error
            
        });
}

// Function to update the table, only changing cells where the content has changed
function updateTable(table, newData) {
    // Define allowed tables with special settings for myTable6
    const defaultTables = ["myTable2", "myTable3", "myTable4", "myTable5", "myTable6"];
    const specialTable = "myTable1";

//    if (!defaultTables.includes(table.id) && table.id !== specialTable) {
//        console.log(`Skipping table: ${table.id}`);
//        return; // Do not update if not in the allowed list

    for (let i = 0; i < newData.length; i++) {
        let row = table.rows[i];
        if (!row) {
            row = table.insertRow();
            row.style.height = ''; // Ensure no height override is applied
        }

        for (let j = 0; j < newData[i].length; j++) {
            let cell = row.cells[j];
            if (!cell) {
                cell = row.insertCell();
                
                // Apply settings based on table ID
                if (table.id === specialTable) {
                    cell.style.padding = '5px'; // Special settings for myTable6
                    cell.style.lineHeight = '0.5';
                } else {
                    cell.style.padding = '6px';  // Default settings for myTable2-5
                    cell.style.lineHeight = '1.5';
                }
            }

            const newCellValue = newData[i][j];
            if (cell.textContent !== newCellValue) {
                cell.textContent = newCellValue;
                cell.classList.add('changed-cell'); // Add 'changed-cell' class if the content changed

                // Remove 'changed-cell' class after a delay (optional)
                setTimeout(() => {
                    cell.classList.remove('changed-cell');
                }, 5000); // Adjust delay for visual effect
            }
        }
    }

    // Remove any extra rows if the new data has fewer rows than the existing table
    while (table.rows.length > newData.length) {
        table.deleteRow(-1);
    }
}




// Function to automatically fetch data every 7 seconds
function autoFetchData() {
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'Sheet1', 'data-container1');
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'Sheet2', 'data-container2');
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'Sheet3', 'data-container3');
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'Sheet4', 'data-container4');
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'Chat', 'data-container5');
    fetchData('1dlA5vn3dlh0_JFZqtuCB9VlruYBHY_HyeVcZVuC7iwk', 'SheetA', 'data-container6');
    setTimeout(autoFetchData, 7000);
}

// Initial data fetch
autoFetchData();
