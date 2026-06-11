using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class FlightController : ControllerBase
{
    private readonly OpenSkyService _openSkyService;

    public FlightController(OpenSkyService openSkyService)
    {
        _openSkyService = openSkyService;
    }

    [HttpGet]
    public async Task<IActionResult> GetFlights()
    {
        try
        {
            var flights = await _openSkyService.GetFlightsAsync();
            return Ok(flights);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error fetching flights: {ex.Message}");
        }
    }

    [HttpGet("track/{icao24}")]
    public async Task<IActionResult> GetTrack(string icao24)
    {
        try
        {
            var track = await _openSkyService.GetFlightTrackAsync(icao24);
            return Ok(track);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error fetching track: {ex.Message}");
        }
    }
}