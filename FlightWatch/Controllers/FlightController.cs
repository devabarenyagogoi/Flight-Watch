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
}