namespace FlightWatch.Models
{
    public class FlightState
    {
        public string Icao24 { get; set; }
        public string Callsign { get; set; }
        public string OriginCountry { get; set; }
        public long? TimePosition { get; set; }
        public long? LastContact { get; set; }
        public double? Longitude { get; set; }
        public double? Latitude { get; set; }
        public double? BaroAltitude { get; set; }
        public bool OnGround { get; set; }
        public double? Velocity { get; set; }
        public double? TrueTrack { get; set; }
        public double? VerticalRate { get; set; }
        public string Sensors { get; set; }
        public double? GeoAltitude { get; set; }
        public string Squawk { get; set; }
        public bool Spi { get; set; }
        public int? PositionSource { get; set; }

        public int? Category { get; set; }
    }
}
