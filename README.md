# Google Images Scraper (freelance job)

## Installation
* Install [NodeJS](https://nodejs.org/en/)
* Run "npm install" in the project root (it will run the download/installation of dependencies)

## Usage
```
node script.js <inputSheet> <columnToRead> <columnToWrite> [--writeOnly]
```
* Run "node script.js products.xlsx b g" for read the column B from the file products.xlsx and to write in the column G
* If you just want to write the keywords already processed, you can use the option "--writeOnly"

## Explanation
The program is designed as a client/server in two different processes, also two scripts. At the beginning, the server is launched by the client. The client will read/write spreadsheets, upload images and send requests to the server for retrieve images URLs. The server, which is the web scraper, that means a headless browser (web browser without user interface), will receive request from the client and send requests to Google Images for retrieving images URLs.
Firstly, the main script read the input spreadsheet and retrieves keywords. The scraper server is ran and for each keyword, a request is sent to this server to retrieve the first image associated to the keyword. Once the image URL is retrieved, a response is sent to the client request containing the image URL. The client upload this image to imgur and write the result into the result file associated to the input file (in the "resources" folder), it is a kind of database. When the message "You upload too fast" appears, the client is paused, waiting X minutes until it is able to upload again. Also, when this limit is reached, the output spreadsheet file associated to the input file is updated from the result file content. After X minutes, the client restarts to send requests to the server and so on. When all keywords are processed, the program is stopped.
When there is a bug or you stop the program, result files allow to NOT start the process from the beginning, the script will skip keywords already processed. Do not remove these files except if you want to restart the process from the beginning.
