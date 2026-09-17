package com.motrice.app;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
public class ExampleUnitTest {

    @Test
    public void addition_isCorrect() throws Exception {
        assertEquals(4, 2 + 2);
    }

    @Test
    public void trackingTimestampAcceptsJavascriptLongValues() {
        long javascriptTimestamp = 1_789_663_200_000L;

        assertEquals(
            Double.valueOf((double) javascriptTimestamp),
            EventLocationTrackingPlugin.coerceNumericValue(javascriptTimestamp)
        );
        assertEquals(Double.valueOf(250.5d), EventLocationTrackingPlugin.coerceNumericValue(250.5d));
        assertNull(EventLocationTrackingPlugin.coerceNumericValue("1789663200000"));
    }
}
